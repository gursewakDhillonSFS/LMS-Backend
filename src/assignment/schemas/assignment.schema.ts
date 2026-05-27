import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AssignmentDocument = Assignment & Document;

@Schema({ timestamps: true, collection: 'assignments' })
export class Assignment {
  @Prop({ required: true, trim: true })
  assignmentName: string;

  @Prop({ required: true })
  dueDate: Date;

  @Prop({ required: true })
  overview: string;

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  courseId: Types.ObjectId;

  // References sub-document _id inside Course.batch array
  @Prop({ required: true })
  batchId: string;

  @Prop({ type: Types.ObjectId, ref: 'Organisation', default: null })
  organisationId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  created_by: Types.ObjectId | null;

  @Prop({
    type: [
      {
        projectName: { type: String, required: true },
        description: { type: String, default: '' },
        objectives: { type: [String], default: [] },
        enableButton: { type: Boolean, default: false },
      },
    ],
    default: [],
  })
  projects: {
    projectName: string;
    description: string;
    objectives: string[];
    enableButton: boolean;
  }[];

  @Prop({ enum: ['published', 'draft'], default: 'published' })
  status: string;
}

export const AssignmentSchema = SchemaFactory.createForClass(Assignment);
AssignmentSchema.index({ courseId: 1, batchId: 1 });
AssignmentSchema.index({ organisationId: 1 });
