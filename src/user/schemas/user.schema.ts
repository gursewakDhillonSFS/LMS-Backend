import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

export enum UserRole {
  STUDENT = 'student',
  INSTRUCTOR = 'instructor',
  ADMIN = 'admin',
  TEACHER = 'teacher',
}

export enum OnboardingStatus {
  PENDING = 'pending',
  COMPLETE = 'complete',
}

export enum AuthProvider {
  LOCAL = 'local',
  GOOGLE = 'google',
}

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ type: String, default: null })
  profileImg: string | null;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ default: null })
  password: string;

  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ required: true, trim: true })
  lastName: string;

  @Prop({ default: null })
  career: string;

  @Prop({ type: [String], default: [] })
  topics: string[];

  @Prop({ default: null })
  educationLevel: string;

  @Prop({ enum: OnboardingStatus, default: OnboardingStatus.PENDING })
  onboardingStatus: OnboardingStatus;

  @Prop({ enum: UserRole, default: UserRole.STUDENT })
  role: UserRole;

  @Prop({ type: Types.ObjectId, ref: 'Organisation', default: null })
  organisationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Teacher', default: null })
  teacherId: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Batch' }], default: [] })
  batchIds: Types.ObjectId[];

  @Prop({ default: false })
  isSubscribed: boolean;

  @Prop({ enum: AuthProvider, default: AuthProvider.LOCAL })
  provider: AuthProvider;

  @Prop({ default: null })
  resetOtp: string;

  @Prop({ default: null })
  resetOtpExpiry: Date;

  @Prop({ enum: ['en', 'pa', 'fr'], default: 'en' })
  preferredLanguage: 'en' | 'pa' | 'fr';
}

export const UserSchema = SchemaFactory.createForClass(User);
