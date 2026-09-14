import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TeacherEarningDocument = TeacherEarning & Document;

@Schema({ timestamps: true, collection: 'teacher_earnings' })
export class TeacherEarning {
  @Prop({ type: Types.ObjectId, ref: 'Teacher', required: true })
  teacherId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organisation', required: true })
  organisationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  courseId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'CoursePurchase', required: true })
  purchaseId: Types.ObjectId;

  @Prop({ type: Number, required: true })
  earningCents: number;

  @Prop({ type: String, default: 'usd' })
  currency: string;

  @Prop({
    type: String,
    enum: ['pending', 'available', 'processing', 'paid', 'action_required', 'reversed'],
    default: 'pending',
  })
  status: string;

  @Prop({ type: String, default: null })
  stripeTransferId: string | null;

  @Prop({ type: Date, default: null })
  transferredAt: Date | null;

  @Prop({ type: String, default: null })
  failureReason: string | null;
}

export const TeacherEarningSchema =
  SchemaFactory.createForClass(TeacherEarning);

TeacherEarningSchema.index({ teacherId: 1, status: 1 });
TeacherEarningSchema.index({ purchaseId: 1 });
