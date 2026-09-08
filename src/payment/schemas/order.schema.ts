import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OrderDocument = Order & Document;

@Schema({ timestamps: true, collection: 'orders' })
export class Order {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: [String], required: true })
  courseIds: string[];

  @Prop({ type: [String], default: [] })
  batchIds: string[];

  @Prop({ type: Number, required: true })
  amountCents: number;

  @Prop({ type: String, default: 'usd' })
  currency: string;

  @Prop({
    type: String,
    enum: ['pending', 'paid', 'failed', 'free'],
    default: 'pending',
  })
  status: string;

  @Prop({ type: String, default: null })
  stripeSessionId: string | null;

  @Prop({ type: String, default: null })
  stripePaymentIntentId: string | null;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
OrderSchema.index({ stripeSessionId: 1 }, { unique: true, sparse: true });
OrderSchema.index({ userId: 1, status: 1 });
