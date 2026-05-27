import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type QuizSubmissionDocument = QuizSubmission & Document;

@Schema({ timestamps: true, collection: 'quiz_submissions' })
export class QuizSubmission {
  @Prop({ type: Types.ObjectId, ref: 'Quiz', required: true })
  quizId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId: Types.ObjectId;

  @Prop({ enum: ['Submitted', 'Graded', 'Not Started'], default: 'Submitted' })
  status: string;

  // Unified answers array — each answer references the question index
  @Prop({
    type: [
      {
        questionIndex: { type: Number, required: true },
        questionType: { type: String, enum: ['mcq', 'essay'], required: true },
        // MCQ specific
        selectedOption: { type: String, default: '' },
        // Essay specific
        submittedText: { type: String, default: '' },
        // Auto-evaluated for both MCQ and short-answer essay
        isCorrect: { type: Boolean, default: false },
        obtainedMarks: { type: Number, default: 0 },
      },
    ],
    default: [],
  })
  answers: {
    questionIndex: number;
    questionType: 'mcq' | 'essay';
    selectedOption: string;
    submittedText: string;
    isCorrect: boolean;
    obtainedMarks: number;
  }[];

  @Prop({ default: 0 })
  totalMarks: number; // Max possible score of this quiz

  @Prop({ default: 0 })
  obtainedScore: number; // Sum of obtainedMarks across all answers

  @Prop({ default: '' })
  feedback: string; // Optional instructor comment

  @Prop({ default: Date.now })
  dateOfSubmit: Date;
}

export const QuizSubmissionSchema =
  SchemaFactory.createForClass(QuizSubmission);
