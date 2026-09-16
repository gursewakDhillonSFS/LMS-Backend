import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ScheduleDocument = Schedule & Document;

@Schema({ timestamps: true, collection: 'schedules' })
export class Schedule {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ default: '', trim: true })
  description: string;

  @Prop({ type: Date, required: true })
  date: Date; // date only (YYYY-MM-DD)

  @Prop({ required: true })
  startTime: string; // e.g. "18:00"

  @Prop({ required: true })
  endTime: string; // e.g. "18:45"

  @Prop({ type: Types.ObjectId, ref: 'Course', default: null })
  courseId: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  batchId: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organisation', required: true })
  organisationId: Types.ObjectId;

  @Prop({ default: '', trim: true })
  meetingLink: string;

  @Prop({ default: '', trim: true })
  recordingUrl: string;

  @Prop({ default: '', trim: true })
  recordingName: string;
}

export const ScheduleSchema = SchemaFactory.createForClass(Schedule);
ScheduleSchema.index({ courseId: 1, batchId: 1, date: 1 });
ScheduleSchema.index({ organisationId: 1, date: 1 });

