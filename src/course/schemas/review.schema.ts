import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReviewDocument = Review & Document;

// ── Phase 4 — Review Module ────────────────────────────────────────────────
// Schema created now; endpoints wired in Phase 4
@Schema({ timestamps: true, collection: 'reviews' })
export class Review {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  course_id: Types.ObjectId;

  @Prop({ type: Number, min: 1, max: 5, required: true })
  rating: number;

  @Prop({ required: true })
  review: string;

  // Denormalized user info (populated on write)
  @Prop({ type: String, default: null })
  user_name: string | null;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);
ReviewSchema.index({ course_id: 1 });
ReviewSchema.index({ user_id: 1, course_id: 1 }, { unique: true }); // one review per user per course
