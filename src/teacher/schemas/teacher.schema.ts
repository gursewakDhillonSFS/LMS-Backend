import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TeacherDocument = Teacher & Document;

@Schema({ timestamps: true, collection: 'teachers' })
export class Teacher {
  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ required: true, trim: true })
  lastName: string;

  @Prop({ enum: ['Male', 'Female', 'Other'], default: null })
  gender: string;

  @Prop({ type: String, default: null })
  dob: string;

  @Prop({ enum: ['Single', 'Married', 'Divorced'], default: null })
  maritalStatus: string;

  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  @Prop({ type: String, default: null })
  phone: string;

  @Prop({ type: String, default: null })
  qualification: string;

  @Prop({ type: [String], default: [] })
  expertIn: string[];

  @Prop({ type: String, default: null })
  photo: string | null;

  @Prop({ type: Types.ObjectId, ref: 'Organisation', default: null })
  organisationId: Types.ObjectId;
}

export const TeacherSchema = SchemaFactory.createForClass(Teacher);
