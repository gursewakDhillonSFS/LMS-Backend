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
}

export const ScheduleSchema = SchemaFactory.createForClass(Schedule);
