import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BatchDocument = Batch & Document;

// ── Phase 3 — Batch Module ─────────────────────────────────────────────────
// Schema created now; full CRUD + chat group creation wired in Phase 3
@Schema({ timestamps: true, collection: 'batches' })
export class Batch {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  course_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Teacher', default: null })
  teacher_id: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Organisation', default: null })
  organisation_id: Types.ObjectId | null;

  // Chat group ref — populated when Phase 6 chat is wired
  @Prop({ type: Types.ObjectId, ref: 'ChatGroup', default: null })
  chat_group_id: Types.ObjectId | null;
}

export const BatchSchema = SchemaFactory.createForClass(Batch);
BatchSchema.index({ course_id: 1 });
