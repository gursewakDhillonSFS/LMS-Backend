import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AssignmentSubmissionDocument = AssignmentSubmission & Document;

@Schema({ timestamps: true, collection: 'assignment_submissions' })
export class AssignmentSubmission {
  @Prop({ type: Types.ObjectId, ref: 'Assignment', required: true })
  assignmentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId: Types.ObjectId;

  // Simple text input — e.g., GitHub link, paragraph summary, etc.
  @Prop({ type: String, default: null })
  submittedText: string | null;

  // Instructor-assigned score e.g. "80/100"
  @Prop({ type: String, default: null })
  result: string | null;

  // Instructor feedback text
  @Prop({ type: String, default: null })
  feedback: string | null;

  @Prop({
    enum: ['Submitted', 'Pending', 'Graded', 'Not Submitted'],
    default: 'Not Submitted',
  })
  status: string;

  @Prop({ type: Date, default: null })
  dateOfSubmit: Date | null;
}

export const AssignmentSubmissionSchema =
  SchemaFactory.createForClass(AssignmentSubmission);
AssignmentSubmissionSchema.index({ assignmentId: 1 });
AssignmentSubmissionSchema.index(
  { studentId: 1, assignmentId: 1 },
  { unique: true },
);
