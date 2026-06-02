import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LessonDocument = Lesson & Document;

@Schema({ timestamps: true, collection: 'lessons' })
export class Lesson {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  course_id: Types.ObjectId;

  @Prop({ required: true, trim: true })
  lesson_name: string;

  @Prop({ type: String, default: null })
  lesson_description: string | null;

  @Prop({ type: String, default: null })
  file_url: string | null;

  @Prop({ type: String, default: null })
  file_name: string | null;

  @Prop({ type: String, default: null })
  file_type: string | null;

  @Prop({
    type: [
      {
        file_url: { type: String, required: true },
        file_name: { type: String, required: true },
        file_type: { type: String, required: true },
      },
    ],
    default: [],
  })
  studyMaterials: { file_url: string; file_name: string; file_type: string }[];

  @Prop({ type: Boolean, default: false })
  unlock_after_previous: boolean;

  @Prop({ type: Date, default: () => new Date() })
  uploaded_at: Date;
}

export const LessonSchema = SchemaFactory.createForClass(Lesson);
LessonSchema.index({ course_id: 1 });
