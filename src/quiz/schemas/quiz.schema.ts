import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type QuizDocument = Quiz & Document;

@Schema({ timestamps: true, collection: 'quizzes' })
export class Quiz {
  @Prop({ required: true, trim: true })
  quizName: string;

  @Prop({ required: true })
  dueDate: Date;

  @Prop({ required: true, enum: ['essay', 'mcq', 'mixed'], default: 'mcq' })
  quizType: string;

  @Prop({ required: true })
  overview: string;

  @Prop({ default: false })
  enableTimer: boolean;

  @Prop({ default: null })
  timer?: string; // e.g. "01:30" = 1 hr 30 min

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  courseId: Types.ObjectId;

  @Prop({ required: true })
  batchId: string;

  @Prop({ type: Types.ObjectId, ref: 'Organisation' })
  organisationId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  created_by?: Types.ObjectId | null;

  // Unified questions array — supports both MCQ and short-answer in one quiz
  @Prop({
    type: [
      {
        questionType: { type: String, enum: ['mcq', 'essay'], required: true },
        question: { type: String, required: true },
        marks: { type: Number, required: true, default: 1 },
        // MCQ fields
        options: { type: [String], default: [] },
        correctOption: { type: String, default: '' },
        // Essay / short-answer field
        correctAnswer: { type: String, default: '' },
      },
    ],
    default: [],
  })
  questions: {
    questionType: 'mcq' | 'essay';
    question: string;
    marks: number;
    options: string[];
    correctOption: string;
    correctAnswer: string;
  }[];

  @Prop({ enum: ['published', 'draft'], default: 'published' })
  status: string;
}

export const QuizSchema = SchemaFactory.createForClass(Quiz);
