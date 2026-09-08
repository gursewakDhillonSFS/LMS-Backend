import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { CommunicationService } from './communication.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: 'communication',
})
export class CommunicationGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger('CommunicationGateway');

  constructor(
    private readonly jwtService: JwtService,
    private readonly communicationService: CommunicationService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.headers?.authorization as string)?.replace(
          /^Bearer\s+/i,
          '',
        );
      if (!token) {
        client.disconnect(true);
        return;
      }
      const payload = this.jwtService.verify<{ sub: string }>(token);
      client.data.userId = payload.sub;
      this.logger.log(`Chat client connected: ${client.id}`);
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('joinRoom')
  async joinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId: string },
  ) {
    const userId = client.data.userId as string;
    if (!userId || !data?.groupId) throw new WsException('Unauthorized');
    await this.communicationService.assertMembership(userId, data.groupId);
    client.join(data.groupId);
    return { event: 'joinRoom', status: 'success' };
  }

  @SubscribeMessage('leaveRoom')
  leaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId: string },
  ) {
    if (data?.groupId) client.leave(data.groupId);
    return { event: 'leaveRoom', status: 'success' };
  }

  @SubscribeMessage('sendMessage')
  async sendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId: string; message: string },
  ) {
    const userId = client.data.userId as string;
    if (!userId || !data?.groupId || !data?.message) {
      throw new WsException('Invalid payload');
    }
    const msg = await this.communicationService.sendMessage(
      userId,
      data.groupId,
      data.message,
    );
    this.server.to(data.groupId).emit('newMessage', msg);
    return { event: 'sendMessage', status: 'success', data: msg };
  }

  @SubscribeMessage('typing')
  typing(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId: string },
  ) {
    const userId = client.data.userId as string;
    if (!data?.groupId || !userId) return;
    client.to(data.groupId).emit('userTyping', { userId, groupId: data.groupId });
  }
}
