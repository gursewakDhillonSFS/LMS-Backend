import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OrganisationEarningDocument = OrganisationEarning & Document;

@Schema({ timestamps: true, collection: 'organisation_earnings' })
export class OrganisationEarning {
  @Prop({ type: Types.ObjectId, ref: 'Organisation', required: true })
  organisationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  courseId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'CoursePurchase', required: true })
  purchaseId: Types.ObjectId;

  @Prop({ type: Number, required: true })
  grossAmountCents: number;

  @Prop({ type: Number, required: true })
  platformFeeCents: number;

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

export const OrganisationEarningSchema =
  SchemaFactory.createForClass(OrganisationEarning);

OrganisationEarningSchema.index({ organisationId: 1, status: 1 });
OrganisationEarningSchema.index({ purchaseId: 1 }, { unique: true });
