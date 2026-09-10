import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TranslationJobDocument = TranslationJob & Document;

@Schema({ timestamps: true, collection: 'translation_jobs' })
export class TranslationJob {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true, index: true })
  course_id: Types.ObjectId;

  @Prop({ type: String, required: true, enum: ['pa', 'fr'] })
  target_locale: string;

  @Prop({ type: String, required: true, enum: ['course', 'lessons', 'full'], default: 'full' })
  entity_type: string;

  @Prop({
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
    index: true,
  })
  status: string;

  @Prop({ type: Number, default: 0 })
  attempts: number;

  @Prop({ type: Number, default: 3 })
  max_attempts: number;

  @Prop({ type: String, default: null })
  error_message: string | null;

  @Prop({ type: Date, default: null })
  locked_at: Date | null;

  @Prop({ type: Date, default: null })
  completed_at: Date | null;
}

export const TranslationJobSchema = SchemaFactory.createForClass(TranslationJob);
TranslationJobSchema.index({ status: 1, locked_at: 1 });
TranslationJobSchema.index({ course_id: 1, target_locale: 1 });
