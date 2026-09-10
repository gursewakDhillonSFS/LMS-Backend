import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import { Server, Socket } from 'socket.io';
import { User, UserDocument } from '../user/schemas/user.schema';
import { Course, CourseDocument } from '../course/schemas/course.schema';

interface AnnouncementBroadcast {
  batchId?: string | null;
  courseId: string;
  [key: string]: unknown;
}

interface SocketUser {
  userId: string;
  email: string;
  role: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'announcements',
})
export class AnnouncementGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger('AnnouncementGateway');

  constructor(
    private readonly jwtService: JwtService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
    @InjectConnection() private connection: Connection,
  ) {}

  afterInit() {
    this.logger.log('WebSocket Gateway Initialized for Announcements');
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.headers?.authorization as string)?.replace(
          /^Bearer\s+/i,
          '',
        );

      if (!token) {
        this.logger.warn(`Client ${client.id} rejected: missing token`);
        client.disconnect(true);
        return;
      }

      const payload = this.jwtService.verify<{
        sub: string;
        email: string;
        role: string;
      }>(token);

      client.data.user = {
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
      } as SocketUser;

      // Automatically join client to their personal room
      client.join(`user_${payload.sub}`);

      // Automatically join client to all allowed course and batch rooms
      try {
        const allowedCourseIds = await this.resolveAllowedCourseIds(
          client.data.user,
        );
        const allowedBatchIds = await this.resolveAllowedBatchIds(
          client.data.user,
        );

        allowedCourseIds.forEach((courseId) => {
          client.join(`course_${courseId}`);
        });

        allowedBatchIds.forEach((batchId) => {
          client.join(`batch_${batchId}`);
        });

        this.logger.log(
          `Client connected: ${client.id} (${payload.email}, role: ${payload.role}) — auto-joined ${allowedCourseIds.size} courses, ${allowedBatchIds.size} batches`,
        );
      } catch (joinErr) {
        this.logger.error(
          `Error auto-joining rooms for client ${client.id}:`,
          joinErr,
        );
      }
    } catch (err) {
      this.logger.warn(`Client ${client.id} rejected: invalid token`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { courseIds?: string[]; batchIds?: string[] },
  ) {
    const user = client.data.user as SocketUser | undefined;
    if (!user?.userId) {
      throw new WsException('Unauthorized');
    }

    const allowedCourseIds = await this.resolveAllowedCourseIds(user);
    const allowedBatchIds = await this.resolveAllowedBatchIds(user);

    const joined: string[] = [];

    if (data?.courseIds && Array.isArray(data.courseIds)) {
      for (const courseId of data.courseIds) {
        if (!courseId) continue;
        if (!allowedCourseIds.has(String(courseId))) {
          this.logger.warn(
            `User ${user.userId} denied join course_${courseId}`,
          );
          continue;
        }
        client.join(`course_${courseId}`);
        joined.push(`course_${courseId}`);
      }
    }

    if (data?.batchIds && Array.isArray(data.batchIds)) {
      for (const batchId of data.batchIds) {
        if (!batchId) continue;
        if (!allowedBatchIds.has(String(batchId))) {
          this.logger.warn(`User ${user.userId} denied join batch_${batchId}`);
          continue;
        }
        client.join(`batch_${batchId}`);
        joined.push(`batch_${batchId}`);
      }
    }

    return { event: 'join', status: 'success', rooms: joined };
  }

  private async resolveAllowedCourseIds(user: SocketUser): Promise<Set<string>> {
    const allowed = new Set<string>();
    const dbUser = await this.userModel.findById(user.userId).lean();
    if (!dbUser) return allowed;

    if (user.role === 'instructor' || user.role === 'teacher') {
      const filter: Record<string, unknown> = {};
      if (dbUser.organisationId) {
        filter.organisation_id = dbUser.organisationId;
      }
      if (user.role === 'teacher' && dbUser.teacherId) {
        filter.$or = [
          { head_teacher: dbUser.teacherId },
          { 'batch.teacher': String(dbUser.teacherId) },
        ];
      } else if (user.role === 'instructor' && dbUser._id) {
        filter.$or = [
          { created_by: dbUser._id },
          { organisation_id: dbUser.organisationId },
        ];
      }
      const courses = await this.courseModel.find(filter).select('_id').lean();
      courses.forEach((c) => allowed.add(String(c._id)));
      return allowed;
    }

    // Student: enrolled courses only
    const enrollments = await this.connection
      .collection('batch_enrolled_students')
      .find({ student_id: new Types.ObjectId(user.userId) })
      .toArray();
    enrollments.forEach((e) => {
      if (e.course_id) allowed.add(String(e.course_id));
    });
    return allowed;
  }

  private async resolveAllowedBatchIds(user: SocketUser): Promise<Set<string>> {
    const allowed = new Set<string>();
    const dbUser = await this.userModel.findById(user.userId).lean();
    if (!dbUser) return allowed;

    if (user.role === 'instructor') {
      const courses = await this.courseModel
        .find({
          $or: [
            { created_by: dbUser._id },
            ...(dbUser.organisationId
              ? [{ organisation_id: dbUser.organisationId }]
              : []),
          ],
        })
        .select('batch')
        .lean();
      courses.forEach((c) => {
        (c.batch || []).forEach((b: { _id?: Types.ObjectId }) => {
          if (b._id) allowed.add(String(b._id));
        });
      });
      return allowed;
    }

    if (user.role === 'teacher' && dbUser.teacherId) {
      const courses = await this.courseModel
        .find({ organisation_id: dbUser.organisationId })
        .select('batch head_teacher instructor_id')
        .lean();
      courses.forEach((c) => {
        const isHeadOrInstructor =
          String(c.head_teacher) === String(dbUser.teacherId) ||
          String(c.instructor_id) === String(dbUser.teacherId);

        (c.batch || []).forEach(
          (b: { _id?: Types.ObjectId; teacher?: string | null }) => {
            if (
              b._id &&
              (isHeadOrInstructor ||
                String(b.teacher) === String(dbUser.teacherId))
            ) {
              allowed.add(String(b._id));
            }
          },
        );
      });
      return allowed;
    }

    // Student: enrolled batches + user.batchIds
    const enrollments = await this.connection
      .collection('batch_enrolled_students')
      .find({ student_id: new Types.ObjectId(user.userId) })
      .toArray();
    enrollments.forEach((e) => {
      if (e.batch_id) allowed.add(String(e.batch_id));
    });
    (dbUser.batchIds || []).forEach((id) => allowed.add(String(id)));
    return allowed;
  }

  broadcastNewAnnouncement(announcement: AnnouncementBroadcast) {
    const payload = {
      event: 'announcement:new',
      data: announcement,
    };

    if (announcement.batchId) {
      const targetRoom = `batch_${announcement.batchId}`;
      this.logger.log(
        `Broadcasting new announcement to batch room: ${targetRoom}`,
      );
      this.server.to(targetRoom).emit('announcement:new', payload);
    } else {
      const targetRoom = `course_${announcement.courseId}`;
      this.logger.log(
        `Broadcasting new announcement to course room: ${targetRoom}`,
      );
      this.server.to(targetRoom).emit('announcement:new', payload);
    }
  }

  broadcastDeletedAnnouncement(
    announcementId: string,
    courseId: string,
    batchId?: string,
  ) {
    const payload = {
      event: 'announcement:deleted',
      data: { _id: announcementId },
    };

    if (batchId) {
      const targetRoom = `batch_${batchId}`;
      this.logger.log(`Broadcasting deletion to batch room: ${targetRoom}`);
      this.server.to(targetRoom).emit('announcement:deleted', payload);
    } else {
      const targetRoom = `course_${courseId}`;
      this.logger.log(`Broadcasting deletion to course room: ${targetRoom}`);
      this.server.to(targetRoom).emit('announcement:deleted', payload);
    }
  }
}
