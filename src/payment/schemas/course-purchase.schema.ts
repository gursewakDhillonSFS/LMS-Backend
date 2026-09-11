import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CoursePurchaseDocument = CoursePurchase & Document;

@Schema({ timestamps: true, collection: 'course_purchases' })
export class CoursePurchase {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  courseId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Batch', default: null })
  batchId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Organisation', required: true })
  organisationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Teacher', default: null })
  teacherId: Types.ObjectId | null;

  // ── Financial (all in cents) ────────────────────────────────────────────────
  @Prop({ type: Number, required: true })
  grossAmountCents: number;

  @Prop({ type: Number, required: true })
  platformFeePercent: number; // snapshot at time of purchase (e.g. 5)

  @Prop({ type: Number, required: true })
  platformFeeCents: number;

  @Prop({ type: Number, required: true })
  organisationShareCents: number;

  @Prop({ type: Number, default: 0 })
  teacherShareCents: number;

  @Prop({ type: Number, default: 0 })
  teacherRevenuePercent: number; // snapshot at time of purchase (e.g. 20)

  @Prop({ type: String, default: 'usd' })
  currency: string;

  // ── Stripe ──────────────────────────────────────────────────────────────────
  @Prop({ type: String, default: null })
  stripeCheckoutSessionId: string | null;

  @Prop({ type: String, default: null })
  stripePaymentIntentId: string | null;

  @Prop({ type: String, default: null })
  stripeCustomerId: string | null;

  // ── Status ──────────────────────────────────────────────────────────────────
  @Prop({
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded', 'cancelled'],
    default: 'pending',
  })
  status: string;

  @Prop({ type: Date, default: null })
  purchasedAt: Date | null;

  @Prop({ type: Date, default: null })
  refundedAt: Date | null;

  // Refund window: 2 days from purchase
  @Prop({ type: Date, default: null })
  refundDeadline: Date | null;
}

export const CoursePurchaseSchema =
  SchemaFactory.createForClass(CoursePurchase);

CoursePurchaseSchema.index(
  { stripeCheckoutSessionId: 1 },
  { unique: true, sparse: true },
);
CoursePurchaseSchema.index({ studentId: 1, courseId: 1 });
CoursePurchaseSchema.index({ studentId: 1, status: 1 });
CoursePurchaseSchema.index({ organisationId: 1 });
CoursePurchaseSchema.index({ teacherId: 1 });
