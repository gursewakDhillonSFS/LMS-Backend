import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationDocument = Notification & Document;

@Schema({ timestamps: true, collection: 'notifications' })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  recipient_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  sender_id: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Course', default: null })
  course_id: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, default: null })
  batch_id: Types.ObjectId | null;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  message: string;

  @Prop({
    type: String,
    enum: ['submission', 'grade', 'live_class', 'announcement', 'system', 'chat'],
    default: 'system',
  })
  type: string;

  @Prop({ default: '', trim: true })
  link: string;

  @Prop({ default: false, index: true })
  is_read: boolean;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ recipient_id: 1, is_read: 1, createdAt: -1 });
