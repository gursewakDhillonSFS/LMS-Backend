import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SubLessonTranslationDocument = SubLessonTranslation & Document;

@Schema({ timestamps: true, collection: 'sublesson_translations' })
export class SubLessonTranslation {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true, index: true })
  course_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Lesson', required: true, index: true })
  lesson_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'SubLesson', required: true, index: true })
  sublesson_id: Types.ObjectId;

  @Prop({ type: String, required: true, enum: ['pa', 'fr', 'en'] })
  locale: string;

  @Prop({ required: true, trim: true })
  sublesson_name: string;

  @Prop({ type: String, default: null })
  sublesson_description: string | null;

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

export const SubLessonTranslationSchema = SchemaFactory.createForClass(SubLessonTranslation);
SubLessonTranslationSchema.index({ sublesson_id: 1, locale: 1 }, { unique: true });
SubLessonTranslationSchema.index({ lesson_id: 1, locale: 1 });
SubLessonTranslationSchema.index({ course_id: 1, locale: 1 });
