import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CertificateDocument = Certificate & Document;

@Schema({ timestamps: true, collection: 'certificates' })
export class Certificate {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  student_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  course_id: Types.ObjectId;

  @Prop({ type: String, required: true })
  course_name: string;

  @Prop({ type: String, required: true })
  student_name: string;

  @Prop({ type: Date, default: Date.now })
  issued_at: Date;

  @Prop({ type: String, unique: true })
  certificate_code: string;

  @Prop({ type: Number, default: 92 })
  marks_obtained: number;

  @Prop({ type: Number, default: 100 })
  total_marks: number;

  @Prop({ type: Number, default: 92 })
  percentage: number;

  @Prop({ type: String, default: 'A+ (Distinction)' })
  grade: string;

  @Prop({ type: String, default: 'Dr. Robert Vance' })
  instructor_name: string;

  @Prop({ type: String, default: 'SkillBuild LMS' })
  organisation_name: string;

  @Prop({ type: String, default: 'Theory, Practical Labs & Capstone Assessment' })
  evaluation_summary: string;
}

export const CertificateSchema = SchemaFactory.createForClass(Certificate);
CertificateSchema.index({ student_id: 1, course_id: 1 }, { unique: true });
