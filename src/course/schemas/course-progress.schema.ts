import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CourseProgressDocument = CourseProgress & Document;

@Schema({ timestamps: true, collection: 'course_progress' })
export class CourseProgress {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  student_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  course_id: Types.ObjectId;

  @Prop({ type: String, required: true })
  batch_id: string;

  @Prop({ type: [Types.ObjectId], default: [] })
  completed_lessons: Types.ObjectId[];

  @Prop({ type: [Types.ObjectId], default: [] })
  completed_sublessons: Types.ObjectId[];

  @Prop({ type: [String], default: [] })
  completed_materials: string[];

  @Prop({ type: [Types.ObjectId], default: [] })
  completed_assignments: Types.ObjectId[];

  @Prop({ type: [Types.ObjectId], default: [] })
  completed_quizzes: Types.ObjectId[];

  @Prop({ type: Number, default: 0 })
  progress_percent: number;

  @Prop({ type: Date, default: null })
  completed_at: Date | null;
}

export const CourseProgressSchema =
  SchemaFactory.createForClass(CourseProgress);
CourseProgressSchema.index(
  { student_id: 1, course_id: 1, batch_id: 1 },
  { unique: true },
);
