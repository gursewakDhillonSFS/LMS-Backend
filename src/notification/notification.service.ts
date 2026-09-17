import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationDocument } from './schemas/notification.schema';

@Injectable()
export class NotificationService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  async createNotification(params: {
    recipient_id: string | Types.ObjectId;
    sender_id?: string | Types.ObjectId | null;
    course_id?: string | Types.ObjectId | null;
    batch_id?: string | Types.ObjectId | null;
    title: string;
    message: string;
    type?: string;
    link?: string;
  }) {
    return this.notificationModel.create({
      recipient_id: new Types.ObjectId(String(params.recipient_id)),
      sender_id: params.sender_id
        ? new Types.ObjectId(String(params.sender_id))
        : null,
      course_id: params.course_id
        ? new Types.ObjectId(String(params.course_id))
        : null,
      batch_id: params.batch_id
        ? new Types.ObjectId(String(params.batch_id))
        : null,
      title: params.title,
      message: params.message,
      type: params.type || 'system',
      link: params.link || '',
      is_read: false,
    });
  }

  async getUserNotifications(userId: string, unreadOnly = false) {
    const userObjId = new Types.ObjectId(userId);
    const filter: Record<string, any> = { recipient_id: userObjId };
    if (unreadOnly) {
      filter.is_read = false;
    }
    const notifications = await this.notificationModel
      .find(filter)
      .populate('sender_id', 'firstName lastName photo')
      .populate('course_id', 'course_name')
      .sort({ createdAt: -1 })
      .limit(60)
      .lean();

    const unreadCount = await this.notificationModel.countDocuments({
      recipient_id: userObjId,
      is_read: false,
    });

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const formatNotification = (n: any) => {
      const sender = n.sender_id;
      const course = n.course_id;
      const createdDate = new Date(n.createdAt);
      const diffMinutes = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60));
      let timeStr = 'Just now';
      if (diffMinutes >= 1440) {
        timeStr = `${Math.floor(diffMinutes / 1440)} days ago`;
      } else if (diffMinutes >= 60) {
        timeStr = `${Math.floor(diffMinutes / 60)} hours ago`;
      } else if (diffMinutes > 0) {
        timeStr = `${diffMinutes} mins ago`;
      }

      return {
        _id: String(n._id),
        course: course?.course_name || 'SkillBuild Announcement',
        message: n.message,
        title: n.title,
        type: n.type,
        time: timeStr,
        link: n.link || '',
        is_read: n.is_read,
        createdAt: n.createdAt,
        avatar: sender?.photo || 'https://randomuser.me/api/portraits/men/32.jpg',
      };
    };

    const formattedList = notifications.map(formatNotification);
    const newItems = formattedList.filter((n) => !n.is_read);
    const todayItems = formattedList.filter((n) => new Date(n.createdAt) >= startOfToday);

    return {
      status: true,
      unreadCount,
      totalCount: formattedList.length,
      data: {
        notifications: formattedList,
        all: formattedList,
        new: newItems,
        today: todayItems,
      },
    };
  }

  async markAsRead(userId: string, notificationId: string) {
    const res = await this.notificationModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(notificationId),
        recipient_id: new Types.ObjectId(userId),
      },
      { $set: { is_read: true } },
      { new: true },
    );
    if (!res) throw new NotFoundException('Notification not found');
    return { status: true, message: 'Notification marked as read' };
  }

  async markAllAsRead(userId: string) {
    await this.notificationModel.updateMany(
      { recipient_id: new Types.ObjectId(userId), is_read: false },
      { $set: { is_read: true } },
    );
    return { status: true, message: 'All notifications marked as read' };
  }
}
