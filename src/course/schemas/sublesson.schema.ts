import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SubLessonDocument = SubLesson & Document;

@Schema({ timestamps: true, collection: 'sublessons' })
export class SubLesson {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  course_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Lesson', required: true })
  lesson_id: Types.ObjectId;

  @Prop({ required: true, trim: true })
  sublesson_name: string;

  @Prop({ type: String, default: null })
  sublesson_description: string | null;

  @Prop({ type: String, default: null })
  file_url: string | null;

  @Prop({ type: String, default: null })
  file_name: string | null;

  @Prop({ type: String, default: null })
  file_type: string | null;

  @Prop({ type: String, default: null })
  duration: string | null;

  @Prop({ type: Date, default: () => new Date() })
  uploaded_at: Date;
}

export const SubLessonSchema = SchemaFactory.createForClass(SubLesson);
SubLessonSchema.index({ course_id: 1, lesson_id: 1 });
