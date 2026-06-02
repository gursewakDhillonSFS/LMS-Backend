import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BatchEnrolledStudentDocument = BatchEnrolledStudent & Document;

// ── Phase 3 — Batch Enrollment ─────────────────────────────────────────────
@Schema({ timestamps: true, collection: 'batch_enrolled_students' })
export class BatchEnrolledStudent {
  @Prop({ type: Types.ObjectId, ref: 'Batch', required: true })
  batch_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  student_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  course_id: Types.ObjectId;
}

export const BatchEnrolledStudentSchema =
  SchemaFactory.createForClass(BatchEnrolledStudent);
BatchEnrolledStudentSchema.index({ batch_id: 1 });
BatchEnrolledStudentSchema.index(
  { student_id: 1, batch_id: 1 },
  { unique: true },
);
