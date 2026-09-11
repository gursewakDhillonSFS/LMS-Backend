import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CourseDocument = Course & Document;

@Schema({ timestamps: true, collection: 'courses' })
export class Course {
  // ── Step 1 — Basic Info ────────────────────────────────────────────────────
  @Prop({ required: true, trim: true })
  course_name: string;

  @Prop({ type: Types.ObjectId, ref: 'Teacher', default: null })
  head_teacher: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  duration: string | null; // "1_week" | "2_weeks" | "1_month" | "3_months"

  @Prop({ enum: ['free', 'paid'], default: 'free' })
  course_type: string;

  @Prop({ type: Number, default: 0 })
  course_price: number;

  @Prop({ type: Boolean, default: false })
  demo_class: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Category', default: null })
  category_id: Types.ObjectId | null;

  @Prop({ type: String, enum: ['morning', 'evening', null], default: null })
  course_schedule: string | null;

  @Prop({ type: Boolean, default: false })
  live_classes: boolean;

  // Batch placeholder array — Phase 3 migrates to dedicated Batch collection
  @Prop({
    type: [{ batchName: String, teacher: { type: String, default: null } }],
    default: [],
  })
  batch: { _id?: Types.ObjectId; batchName: string; teacher: string | null }[];

  // ── Step 2 — Media & Learning ──────────────────────────────────────────────
  @Prop({ type: String, default: null })
  course_image_url: string | null;

  @Prop({ type: [String], default: [] })
  learning_points: string[];

  @Prop({ type: [String], default: [] })
  skills_you_gain: string[];

  // ── Step 3 — Description & Teacher ────────────────────────────────────────
  @Prop({ type: String, default: null })
  about_course: string | null;

  @Prop({ type: Types.ObjectId, ref: 'Teacher', default: null })
  instructor_id: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  description: string | null;

  // ── Step 4 (Final) — Overview ─────────────────────────────────────────────
  @Prop({ type: String, default: null })
  overview: string | null;

  // ── Status ─────────────────────────────────────────────────────────────────
  @Prop({ enum: ['draft', 'published', 'unpublished'], default: 'draft' })
  course_status: string;

  // ── Phase 3/4 Reserved (default placeholders, populated later) ────────────
  @Prop({ type: Number, default: 0 })
  enrolled_user_count: number;

  @Prop({ type: Number, default: 0 })
  average_rating: number;

  @Prop({ type: Number, default: 0 })
  review_count: number;

  // ── Teacher Revenue ─────────────────────────────────────────────────────
  @Prop({ type: Number, default: null })
  teacherRevenuePercent: number | null; // null = use org/env default (e.g. 20%)

  // ── Ownership ──────────────────────────────────────────────────────────────
  @Prop({ type: Types.ObjectId, ref: 'Organisation', default: null })
  organisation_id: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  created_by: Types.ObjectId;
}

export const CourseSchema = SchemaFactory.createForClass(Course);

// Index for fast listing + search
CourseSchema.index({ created_by: 1, course_status: 1 });
CourseSchema.index({ course_name: 'text' });
CourseSchema.index({ category_id: 1 });
