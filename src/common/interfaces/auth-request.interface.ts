import { Request } from 'express';

export interface RequestUser {
  userId: string;
  email: string;
  role: string;
  instructorId?: string;
  studentId?: string;
  teacherId?: string;
  organisationId?: string;
}

export interface AuthenticatedRequest extends Request {
  user: RequestUser;
}
