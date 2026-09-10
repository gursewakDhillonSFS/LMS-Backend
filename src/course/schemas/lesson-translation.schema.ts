import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LessonTranslationDocument = LessonTranslation & Document;

@Schema({ timestamps: true, collection: 'lesson_translations' })
export class LessonTranslation {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true, index: true })
  course_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Lesson', required: true, index: true })
  lesson_id: Types.ObjectId;

  @Prop({ type: String, required: true, enum: ['pa', 'fr', 'en'] })
  locale: string;

  @Prop({ required: true, trim: true })
  lesson_name: string;

  @Prop({ type: String, default: null })
  lesson_description: string | null;

  @Prop({
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'outdated'],
    default: 'completed',
  })
  status: string;

  @Prop({
    type: String,
    enum: ['machine_generated', 'manually_edited'],
    default: 'machine_generated',
  })
  source: string;

  @Prop({ type: Date, default: () => new Date() })
  translated_at: Date;
}

export const LessonTranslationSchema = SchemaFactory.createForClass(LessonTranslation);
LessonTranslationSchema.index({ lesson_id: 1, locale: 1 }, { unique: true });
LessonTranslationSchema.index({ course_id: 1, locale: 1 });
