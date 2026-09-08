import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ChatGroup, ChatGroupDocument } from './schemas/chat-group.schema';
import {
  ChatMessage,
  ChatMessageDocument,
} from './schemas/chat-message.schema';
import { User, UserDocument } from '../user/schemas/user.schema';

@Injectable()
export class CommunicationService {
  constructor(
    @InjectModel(ChatGroup.name)
    private chatGroupModel: Model<ChatGroupDocument>,
    @InjectModel(ChatMessage.name)
    private chatMessageModel: Model<ChatMessageDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
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
            members: {
              $each: memberIds.map((id) => new Types.ObjectId(id)),
            },
          },
        },
      );
      group = await this.chatGroupModel.findById(group._id);
    }
    return group;
  }

  async addMember(batchId: string, userId: string) {
    await this.chatGroupModel.updateOne(
      { batch_id: new Types.ObjectId(batchId) },
      { $addToSet: { members: new Types.ObjectId(userId) } },
    );
  }

  async getUserRooms(userId: string) {
    const groups = await this.chatGroupModel
      .find({ members: new Types.ObjectId(userId) })
      .sort({ updatedAt: -1 })
      .lean();

    const rooms = await Promise.all(
      groups.map(async (g) => {
        const last = await this.chatMessageModel
          .findOne({ groupId: g._id })
          .sort({ createdAt: -1 })
          .lean();
        return {
          _id: String(g._id),
          names: g.name,
          batch_id: String(g.batch_id),
          course_id: String(g.course_id),
          avatar: null,
          lastMessage: last
            ? {
                sender_id: String(last.senderId),
                message_type: last.messageType,
                message: last.message,
                message_time: {
                  seconds: Math.floor(
                    new Date(
                      (last as { createdAt?: Date }).createdAt || Date.now(),
                    ).getTime() / 1000,
                  ),
                },
              }
            : null,
          unread_count: {},
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
    });
    const sender = await this.userModel
      .findById(userId)
      .select('firstName lastName photo')
      .lean();
    return {
      _id: String(msg._id),
      groupId,
      senderId: userId,
      senderName: sender
        ? `${sender.firstName || ''} ${sender.lastName || ''}`.trim()
        : 'User',
      senderPhoto: (sender as { photo?: string })?.photo || null,
      message: msg.message,
      messageType: 'text',
      createdAt: (msg as unknown as { createdAt?: Date }).createdAt || new Date(),
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
