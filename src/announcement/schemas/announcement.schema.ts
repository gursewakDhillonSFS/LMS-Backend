import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AnnouncementDocument = Announcement & Document;

@Schema({ timestamps: true, collection: 'announcements' })
export class Announcement {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  message: string;

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  courseId: Types.ObjectId;

  @Prop({ type: String, default: null })
  batchId: string | null; // Target specific batch, if null or empty, it targets the entire course

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  instructorId: Types.ObjectId;

  @Prop({ enum: ['published', 'draft'], default: 'published' })
  status: string;

  @Prop({ type: Date, default: null })
  scheduledAt: Date | null; // Midnight date for publication

  @Prop({ type: Date, default: null })
  publishedAt: Date | null;
}

export const AnnouncementSchema = SchemaFactory.createForClass(Announcement);
AnnouncementSchema.index({ courseId: 1, status: 1 });
AnnouncementSchema.index({ scheduledAt: 1, status: 1 });
AnnouncementSchema.index({ instructorId: 1 });

