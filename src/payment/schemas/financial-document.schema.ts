import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FinancialDocumentDocument = FinancialDocument & Document;

@Schema({ timestamps: true, collection: 'financial_documents' })
export class FinancialDocument {
  @Prop({
    type: String,
    enum: [
      'student_purchase',
      'organisation_earning',
      'teacher_earning',
      'payout',
      'refund',
    ],
    required: true,
  })
  type: string;

  @Prop({ type: Types.ObjectId, required: true })
  referenceId: Types.ObjectId; // purchaseId / earningId

  @Prop({ type: Types.ObjectId, required: true })
  ownerId: Types.ObjectId; // who can access this doc

  @Prop({
    type: String,
    enum: ['student', 'organisation', 'teacher', 'admin'],
    required: true,
  })
  ownerType: string;

  @Prop({ type: Number, required: true })
  amountCents: number;

  @Prop({ type: String, default: 'usd' })
  currency: string;

  @Prop({ type: String, required: true })
  description: string;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;

  @Prop({ type: String, default: null })
  documentUrl: string | null; // PDF link if generated
}

export const FinancialDocumentSchema =
  SchemaFactory.createForClass(FinancialDocument);

FinancialDocumentSchema.index({ ownerId: 1, ownerType: 1 });
FinancialDocumentSchema.index({ referenceId: 1 });
FinancialDocumentSchema.index({ type: 1 });
