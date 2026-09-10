import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CourseTranslationDocument = CourseTranslation & Document;

@Schema({ timestamps: true, collection: 'course_translations' })
export class CourseTranslation {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true, index: true })
  course_id: Types.ObjectId;

  @Prop({ type: String, required: true, enum: ['pa', 'fr', 'en'] })
  locale: string;

  @Prop({ required: true, trim: true })
  course_name: string;

  @Prop({ type: String, default: null })
  about_course: string | null;

  @Prop({ type: String, default: null })
  description: string | null;

  @Prop({ type: String, default: null })
  overview: string | null;

  @Prop({ type: [String], default: [] })
  learning_points: string[];

  @Prop({ type: [String], default: [] })
  skills_you_gain: string[];

  @Prop({
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'outdated'],
    default: 'completed',
    index: true,
  })
  status: string;

  @Prop({
    type: String,
    enum: ['machine_generated', 'manually_edited'],
    default: 'machine_generated',
  })
  source: string;

  @Prop({ type: String, default: null })
  content_hash: string | null; // SHA-256 hash of source English content

  @Prop({ type: String, default: null })
  error_message: string | null;

  @Prop({ type: Date, default: () => new Date() })
  translated_at: Date;
}

export const CourseTranslationSchema = SchemaFactory.createForClass(CourseTranslation);
CourseTranslationSchema.index({ course_id: 1, locale: 1 }, { unique: true });
