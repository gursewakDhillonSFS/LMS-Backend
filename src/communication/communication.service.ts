import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import { ChatGroup, ChatGroupDocument } from './schemas/chat-group.schema';
import {
  ChatMessage,
  ChatMessageDocument,
} from './schemas/chat-message.schema';
import { User, UserDocument } from '../user/schemas/user.schema';
import { Course, CourseDocument } from '../course/schemas/course.schema';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class CommunicationService {
  constructor(
    @InjectModel(ChatGroup.name)
    private chatGroupModel: Model<ChatGroupDocument>,
    @InjectModel(ChatMessage.name)
    private chatMessageModel: Model<ChatMessageDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
    @InjectConnection() private connection: Connection,
    private readonly notificationService: NotificationService,
  ) {}

  async ensureGroupForBatch(
    courseId: string,
    batchId: string,
    name: string,
    memberIds: string[] = [],
  ) {
    let group = await this.chatGroupModel.findOne({
      batch_id: new Types.ObjectId(batchId),
    });
    if (!group) {
      group = await this.chatGroupModel.create({
        name,
        course_id: new Types.ObjectId(courseId),
        batch_id: new Types.ObjectId(batchId),
        members: memberIds.map((id) => new Types.ObjectId(id)),
      });
    } else if (memberIds.length) {
      await this.chatGroupModel.updateOne(
        { _id: group._id },
        {
          $addToSet: {
            members: { $each: memberIds.map((id) => new Types.ObjectId(id)) },
          },
        },
      );
      group = await this.chatGroupModel.findById(group._id);
    }
    return group;
  }

  async addMember(groupId: string, userId: string) {
    await this.chatGroupModel.updateOne(
      { _id: new Types.ObjectId(groupId) },
      { $addToSet: { members: new Types.ObjectId(userId) } },
    );
  }

  async getUserRooms(userId: string) {
    // 1. Auto-sync user's courses and batches into chat groups
    try {
      const user = await this.userModel.findById(userId).lean();
      const userObjId = new Types.ObjectId(userId);

      let courses: any[] = [];
      if (user?.role === 'instructor') {
        courses = await this.courseModel
          .find({
            $or: [
              { instructor_id: userObjId },
              ...(user.organisationId ? [{ organisation_id: user.organisationId }] : []),
            ],
          })
          .lean();
      } else if (user?.role === 'teacher') {
        courses = await this.courseModel
          .find({
            $or: [
              { instructor_id: userObjId },
              { head_teacher: userObjId },
              { 'batch.teacher': String(userId) },
            ],
          })
          .lean();
      }

      // Also find courses where student is enrolled
      const enrollments = await this.connection
        .collection('batch_enrolled_students')
        .find({ student_id: userObjId })
        .toArray();

      if (enrollments.length > 0) {
        const enrolledCourseIds = enrollments.map((e) => e.course_id);
        const enrolledCourses = await this.courseModel
          .find({ _id: { $in: enrolledCourseIds } })
          .lean();
        courses = [...courses, ...enrolledCourses];
      }

      const courseMap = new Map();
      for (const c of courses) {
        courseMap.set(String(c._id), c);
      }

      for (const c of courseMap.values()) {
        const batches = c.batch || [];
        for (const b of batches) {
          const batchName = b.batchName || 'Cohort';
          const roomName = `${c.course_name} (${batchName})`;
          await this.ensureGroupForBatch(
            String(c._id),
            String(b._id),
            roomName,
            [userId],
          );
        }
      }
    } catch {
      // sync is best-effort
    }

    // 2. Fetch all groups where user is a member
    const groups = await this.chatGroupModel
      .find({ members: new Types.ObjectId(userId) })
      .sort({ updatedAt: -1 })
      .lean();

    const rooms = await Promise.all(
      groups.map(async (g) => {
        const [last, course, membersList] = await Promise.all([
          this.chatMessageModel.findOne({ groupId: g._id }).sort({ createdAt: -1 }).lean(),
          this.courseModel.findById(g.course_id).select('course_name course_image_url batch').lean(),
          this.userModel.find({ _id: { $in: g.members } }).select('firstName lastName photo role').lean(),
        ]);

        const batchObj = (course?.batch || []).find((b: any) => String(b._id) === String(g.batch_id));

        return {
          _id: String(g._id),
          name: g.name,
          names: g.name,
          type: 'course',
          courseTitle: course?.course_name || g.name,
          batchName: batchObj?.batchName || 'Class Cohort',
          batch_id: String(g.batch_id),
          course_id: String(g.course_id),
          avatar: course?.course_image_url || null,
          memberCount: g.members?.length || membersList.length || 1,
          unreadCount: 0,
          description: `Active discussion and collaboration room for ${course?.course_name || 'this course'}.`,
          lastMessage: last
            ? {
                message: last.message || '',
                senderName: '',
                sender_id: String(last.senderId),
                message_type: last.messageType,
                createdAt: (last as any).createdAt || new Date().toISOString(),
                message_time: {
                  seconds: Math.floor(
                    new Date(
                      (last as { createdAt?: Date }).createdAt || Date.now(),
                    ).getTime() / 1000,
                  ),
                },
              }
            : null,
          participants: membersList.map((m) => ({
            id: String(m._id),
            name: `${m.firstName || ''} ${m.lastName || ''}`.trim() || 'User',
            role: m.role || 'student',
            photo: (m as any).photo || null,
            isOnline: true,
          })),
        };
      }),
    );

    return { status: true, data: rooms };
  }

  async getMessages(userId: string, groupId: string, page = 1, limit = 50) {
    await this.assertMembership(userId, groupId);
    const skip = (page - 1) * limit;
    const [messages, total] = await Promise.all([
      this.chatMessageModel
        .find({ groupId: new Types.ObjectId(groupId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.chatMessageModel.countDocuments({
        groupId: new Types.ObjectId(groupId),
      }),
    ]);

    const enriched = await Promise.all(
      messages.reverse().map(async (m) => {
        const sender = await this.userModel
          .findById(m.senderId)
          .select('firstName lastName photo')
          .lean();
        return {
          _id: String(m._id),
          groupId: String(m.groupId),
          senderId: String(m.senderId),
          senderName: sender
            ? `${sender.firstName || ''} ${sender.lastName || ''}`.trim()
            : 'User',
          senderPhoto: (sender as { photo?: string })?.photo || null,
          message: m.message,
          messageType: m.messageType,
          reactions: (m as { reactions?: any[] }).reactions || [],
          createdAt: (m as { createdAt?: Date }).createdAt,
        };
      }),
    );

    return {
      status: true,
      data: { messages: enriched, total, page },
    };
  }

  async sendMessage(userId: string, groupId: string, message: string) {
    await this.assertMembership(userId, groupId);
    const msg = await this.chatMessageModel.create({
      groupId: new Types.ObjectId(groupId),
      senderId: new Types.ObjectId(userId),
      message,
      messageType: 'text',
      reactions: [],
    });
    const sender = await this.userModel
      .findById(userId)
      .select('firstName lastName photo')
      .lean();

    const senderName = sender
      ? `${sender.firstName || ''} ${sender.lastName || ''}`.trim()
      : 'User';

    // Dispatch in-app notifications to other members in background
    (async () => {
      try {
        const group = await this.chatGroupModel.findById(groupId).lean();
        if (group) {
          const recipientIds = new Set<string>();

          // 1. Existing group members
          if (Array.isArray(group.members)) {
            group.members.forEach((m) => {
              if (String(m) !== String(userId)) {
                recipientIds.add(String(m));
              }
            });
          }

          // 2. All enrolled students in this batch or course
          if (group.batch_id || group.course_id) {
            const enrollFilter: Record<string, unknown> = {};
            if (group.batch_id) {
              enrollFilter.batch_id = group.batch_id;
            } else if (group.course_id) {
              enrollFilter.course_id = group.course_id;
            }

            const enrollments = await this.connection
              .collection('batch_enrolled_students')
              .find(enrollFilter)
              .toArray();

            enrollments.forEach((e) => {
              if (e.student_id && String(e.student_id) !== String(userId)) {
                recipientIds.add(String(e.student_id));
              }
            });
          }

          // 3. Course Instructor / Head Teacher / Batch Teacher
          if (group.course_id) {
            const course = await this.courseModel
              .findById(group.course_id)
              .select('instructor_id head_teacher batch')
              .lean();

            if (course) {
              if (
                course.instructor_id &&
                String(course.instructor_id) !== String(userId)
              ) {
                recipientIds.add(String(course.instructor_id));
              }
              if (
                course.head_teacher &&
                String(course.head_teacher) !== String(userId)
              ) {
                recipientIds.add(String(course.head_teacher));
              }
              if (Array.isArray(course.batch) && group.batch_id) {
                const batchObj = (course.batch as any[]).find(
                  (b: any) => String(b._id) === String(group.batch_id),
                );
                if (
                  batchObj &&
                  batchObj.teacher &&
                  String(batchObj.teacher) !== String(userId)
                ) {
                  recipientIds.add(String(batchObj.teacher));
                }
              }
            }
          }

          // Also ensure all recipients are saved in group.members
          if (recipientIds.size > 0) {
            const memberObjIds = Array.from(recipientIds).map(
              (id) => new Types.ObjectId(id),
            );
            await this.chatGroupModel.updateOne(
              { _id: group._id },
              { $addToSet: { members: { $each: memberObjIds } } },
            );
          }

          const snippet =
            message.length > 70 ? `${message.substring(0, 67)}...` : message;

          await Promise.all(
            Array.from(recipientIds).map((mId) =>
              this.notificationService.createNotification({
                recipient_id: mId,
                sender_id: userId,
                course_id: group.course_id || null,
                batch_id: group.batch_id || null,
                title: `New message from ${senderName}`,
                message: snippet,
                type: 'chat',
                link: '/chat',
              }),
            ),
          );
        }
      } catch (notifErr) {
        console.warn('Failed to send in-app chat notifications:', notifErr);
      }
    })();

    return {
      _id: String(msg._id),
      groupId,
      senderId: userId,
      senderName,
      senderPhoto: (sender as { photo?: string })?.photo || null,
      message: msg.message,
      messageType: 'text',
      reactions: [],
      createdAt: (msg as unknown as { createdAt?: Date }).createdAt || new Date(),
    };
  }

  async addReaction(userId: string, messageId: string, emoji: string) {
    const msg = await this.chatMessageModel.findById(messageId);
    if (!msg) throw new NotFoundException('Message not found');

    await this.assertMembership(userId, String(msg.groupId));

    const reactions = msg.reactions || [];
    const existingIndex = reactions.findIndex((r) => r.emoji === emoji);

    if (existingIndex > -1) {
      const reaction = reactions[existingIndex];
      const userIndex = reaction.users.indexOf(String(userId));
      if (userIndex > -1) {
        // User already reacted with this emoji: remove (toggle off)
        reaction.users.splice(userIndex, 1);
        reaction.count = Math.max(0, reaction.count - 1);
        if (reaction.count === 0 || reaction.users.length === 0) {
          reactions.splice(existingIndex, 1);
        }
      } else {
        // Add reaction
        reaction.users.push(String(userId));
        reaction.count += 1;
      }
    } else {
      // First reaction with this emoji
      reactions.push({
        emoji,
        count: 1,
        users: [String(userId)],
      });
    }

    msg.reactions = reactions;
    await msg.save();

    return {
      messageId: String(msg._id),
      groupId: String(msg.groupId),
      reactions: msg.reactions,
    };
  }

  async assertMembership(userId: string, groupId: string) {
    const group = await this.chatGroupModel.findById(groupId);
    if (!group) throw new NotFoundException('Chat group not found');
    const isMember = group.members.some(
      (m) => String(m) === String(userId),
    );
    if (!isMember) {
      throw new ForbiddenException('Not a member of this chat group');
    }
    return group;
  }
}
