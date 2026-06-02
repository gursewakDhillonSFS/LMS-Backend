import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

interface AnnouncementBroadcast {
  batchId?: string | null;
  courseId: string;
  [key: string]: unknown;
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

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway Initialized for Announcements');
  }

  handleConnection(client: Socket, ...args: unknown[]) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { courseIds?: string[]; batchIds?: string[] },
  ) {
    this.logger.log(
      `Client ${client.id} joining rooms: ${JSON.stringify(data)}`,
    );
    if (data?.courseIds && Array.isArray(data.courseIds)) {
      data.courseIds.forEach((courseId) => {
        if (courseId) {
          client.join(`course_${courseId}`);
          this.logger.log(
            `Client ${client.id} joined room: course_${courseId}`,
          );
        }
      });
    }

    if (data?.batchIds && Array.isArray(data.batchIds)) {
      data.batchIds.forEach((batchId) => {
        if (batchId) {
          client.join(`batch_${batchId}`);
          this.logger.log(`Client ${client.id} joined room: batch_${batchId}`);
        }
      });
    }

    return { event: 'join', status: 'success' };
  }

  // Helper method to broadcast a new announcement to targeted audience
  broadcastNewAnnouncement(announcement: AnnouncementBroadcast) {
    const payload = {
      event: 'announcement:new',
      data: announcement,
    };

    if (announcement.batchId) {
      // Emit to targeted batch only
      const targetRoom = `batch_${announcement.batchId}`;
      this.logger.log(
        `Broadcasting new announcement to batch room: ${targetRoom}`,
      );
      this.server.to(targetRoom).emit('announcement:new', payload);
    } else {
      // Emit to whole course
      const targetRoom = `course_${announcement.courseId}`;
      this.logger.log(
        `Broadcasting new announcement to course room: ${targetRoom}`,
      );
      this.server.to(targetRoom).emit('announcement:new', payload);
    }
  }

  // Helper method to broadcast hard deletion
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
