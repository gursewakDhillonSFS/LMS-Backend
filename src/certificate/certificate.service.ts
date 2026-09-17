import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import {
  Certificate,
  CertificateDocument,
} from './schemas/certificate.schema';
import { Course, CourseDocument } from '../course/schemas/course.schema';
import { User, UserDocument } from '../user/schemas/user.schema';
import { randomBytes } from 'crypto';

@Injectable()
export class CertificateService {
  constructor(
    @InjectModel(Certificate.name)
    private certificateModel: Model<CertificateDocument>,
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectConnection() private connection: Connection,
  ) {}

  async issueCertificate(studentId: string, courseId: string) {
    const existing = await this.certificateModel.findOne({
      student_id: new Types.ObjectId(studentId),
      course_id: new Types.ObjectId(courseId),
    });
    if (existing) {
      return { status: true, message: 'Certificate already issued', data: existing };
    }

    const [course, user] = await Promise.all([
      this.courseModel.findById(courseId).lean(),
      this.userModel.findById(studentId).lean(),
    ]);
    if (!course) throw new NotFoundException('Course not found');
    if (!user) throw new NotFoundException('Student not found');

    const cert = await this.certificateModel.create({
      student_id: new Types.ObjectId(studentId),
      course_id: new Types.ObjectId(courseId),
      course_name: course.course_name,
      student_name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Learner',
      issued_at: new Date(),
      certificate_code: `SKILLBUILD-${randomBytes(4).toString('hex').toUpperCase()}`,
    });

    return { status: true, message: 'Certificate generated successfully', data: cert };
  }

  async issueIfEligible(studentId: string, courseId: string, batchId: string) {
    const progress = await this.connection.collection('course_progress').findOne({
      student_id: new Types.ObjectId(studentId),
      course_id: new Types.ObjectId(courseId),
      batch_id: batchId,
    });
    if (!progress || (progress.progress_percent || 0) < 100) {
      return null;
    }

    const existing = await this.certificateModel.findOne({
      student_id: new Types.ObjectId(studentId),
      course_id: new Types.ObjectId(courseId),
    });
    if (existing) return existing;

    const [course, user] = await Promise.all([
      this.courseModel.findById(courseId).lean(),
      this.userModel.findById(studentId).lean(),
    ]);
    if (!course || !user) return null;

    return this.certificateModel.create({
      student_id: new Types.ObjectId(studentId),
      course_id: new Types.ObjectId(courseId),
      course_name: course.course_name,
      student_name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      issued_at: new Date(),
      certificate_code: `LMS-${randomBytes(6).toString('hex').toUpperCase()}`,
    });
  }

  async listForStudent(studentId: string) {
    const certs = await this.certificateModel
      .find({ student_id: new Types.ObjectId(studentId) })
      .sort({ issued_at: -1 })
      .lean();
    return {
      status: true,
      data: certs.map((c) => ({
        certificate_id: String(c._id),
        course_id: String(c.course_id),
        course_name: c.course_name,
        student_name: c.student_name,
        issued_at: c.issued_at,
        certificate_code: c.certificate_code,
      })),
    };
  }

  async verify(code: string) {
    const cert = await this.certificateModel.findOne({ certificate_code: code }).lean();
    if (!cert) throw new NotFoundException('Certificate not found');
    return { status: true, data: cert };
  }
}
