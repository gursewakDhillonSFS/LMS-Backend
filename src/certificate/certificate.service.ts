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

  private async computeEvaluationDetails(studentId: string, course: any) {
    let marksObtained: number | null = null;
    let totalMarks: number | null = null;
    let percentage: number | null = null;
    let grade = 'Completed';
    let evalSummary: string | null = null;

    try {
      const studentObjId = Types.ObjectId.isValid(studentId) ? new Types.ObjectId(studentId) : null;
      const courseObjId = Types.ObjectId.isValid(course?._id) ? new Types.ObjectId(course._id) : null;

      const AssignmentModel = this.connection.model('Assignment');
      const SubmissionModel = this.connection.model('AssignmentSubmission');
      const QuizModel = this.connection.model('Quiz');
      const QuizSubmissionModel = this.connection.model('QuizSubmission');

      const [assignments, quizzes] = await Promise.all([
        AssignmentModel.find({
          $or: [
            ...(courseObjId ? [{ courseId: courseObjId }] : []),
            { courseId: String(course?._id) },
          ],
        }).lean() as Promise<any[]>,
        QuizModel.find({
          $or: [
            ...(courseObjId ? [{ courseId: courseObjId }] : []),
            { courseId: String(course?._id) },
          ],
        }).lean() as Promise<any[]>,
      ]);

      const assignmentIds = assignments.map((a) => a._id);
      const quizIds = quizzes.map((q) => q._id);

      const [submissions, quizSubmissions] = await Promise.all([
        assignmentIds.length > 0
          ? (SubmissionModel.find({
              assignmentId: { $in: assignmentIds },
              studentId: studentObjId || studentId,
            }).lean() as Promise<any[]>)
          : Promise.resolve([]),
        quizIds.length > 0
          ? (QuizSubmissionModel.find({
              quizId: { $in: quizIds },
              studentId: studentObjId || studentId,
            }).lean() as Promise<any[]>)
          : Promise.resolve([]),
      ]);

      let earned = 0;
      let total = 0;
      let gradedCount = 0;

      for (const a of assignments) {
        const sub = submissions.find((s) => String(s.assignmentId) === String(a._id));
        const maxMarks = Number(a.totalMarks) || 100;
        if (sub && sub.obtainedScore !== undefined && sub.obtainedScore !== null) {
          earned += Number(sub.obtainedScore);
          total += maxMarks;
          gradedCount++;
        }
      }

      for (const q of quizzes) {
        const sub = quizSubmissions.find((s) => String(s.quizId) === String(q._id));
        const maxMarks = Number(q.totalMarks) || 100;
        if (sub && sub.obtainedScore !== undefined && sub.obtainedScore !== null) {
          earned += Number(sub.obtainedScore);
          total += maxMarks;
          gradedCount++;
        }
      }

      if (gradedCount > 0 && total > 0) {
        marksObtained = Math.round(earned);
        totalMarks = Math.round(total);
        percentage = Math.min(100, Math.max(0, Math.round((earned / total) * 100)));
        evalSummary = `Based on ${gradedCount} graded assignment${gradedCount === 1 ? '' : 's'} and quiz${gradedCount === 1 ? '' : 'zes'}`;
      }
    } catch {
      // Leave scores empty when assessments cannot be loaded
    }

    if (percentage !== null) {
      if (percentage >= 90) grade = 'A+ (Distinction)';
      else if (percentage >= 80) grade = 'A (Excellent)';
      else if (percentage >= 70) grade = 'B+ (Very Good)';
      else if (percentage >= 60) grade = 'B (Good)';
      else grade = 'Pass';
    }

    // Resolve instructor name
    let instructorName: string | null = null;
    try {
      const teacherRef = course?.head_teacher || course?.instructor_id || course?.batch?.[0]?.teacher;
      if (teacherRef && Types.ObjectId.isValid(String(teacherRef))) {
        const TeacherModel = this.connection.model('Teacher');
        const teacher = await TeacherModel.findById(teacherRef).lean();
        if (teacher) {
          const name = `${(teacher as any).firstName || ''} ${(teacher as any).lastName || ''}`.trim();
          if (name) instructorName = name;
        }
      }
      if (!instructorName && course?.created_by && Types.ObjectId.isValid(String(course.created_by))) {
        const teacherUser = await this.userModel.findById(course.created_by).lean();
        if (teacherUser) {
          const name = `${teacherUser.firstName || ''} ${teacherUser.lastName || ''}`.trim();
          if (name) instructorName = name;
        }
      }
    } catch {
      // ignore
    }

    return { marksObtained, totalMarks, percentage, grade, instructorName, evalSummary };
  }

  async issueCertificate(studentId: string, courseId: string) {
    const studentObjId = Types.ObjectId.isValid(studentId) ? new Types.ObjectId(studentId) : null;
    const courseObjId = Types.ObjectId.isValid(courseId) ? new Types.ObjectId(courseId) : null;

    const existing = await this.certificateModel.findOne({
      $or: [
        ...(studentObjId && courseObjId ? [{ student_id: studentObjId, course_id: courseObjId }] : []),
        { student_id: String(studentId), course_id: String(courseId) },
        ...(studentObjId ? [{ student_id: studentObjId, course_id: String(courseId) }] : []),
        ...(courseObjId ? [{ student_id: String(studentId), course_id: courseObjId }] : []),
      ],
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

    const evalDetails = await this.computeEvaluationDetails(studentId, course);

    const cert = await this.certificateModel.create({
      student_id: studentObjId || studentId,
      course_id: courseObjId || courseId,
      course_name: course.course_name,
      student_name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Learner',
      issued_at: new Date(),
      certificate_code: `SKILLBUILD-${randomBytes(4).toString('hex').toUpperCase()}`,
      marks_obtained: evalDetails.marksObtained,
      total_marks: evalDetails.totalMarks,
      percentage: evalDetails.percentage,
      grade: evalDetails.grade,
      instructor_name: evalDetails.instructorName,
      organisation_name: 'SkillBuild LMS',
      evaluation_summary: evalDetails.evalSummary,
    });

    return { status: true, message: 'Certificate generated successfully', data: cert };
  }

  async issueIfEligible(studentId: string, courseId: string, batchId: string) {
    const studentObjId = Types.ObjectId.isValid(studentId) ? new Types.ObjectId(studentId) : null;
    const courseObjId = Types.ObjectId.isValid(courseId) ? new Types.ObjectId(courseId) : null;

    const progress = await this.connection.collection('course_progress').findOne({
      ...(studentObjId
        ? { $or: [{ student_id: studentObjId }, { student_id: studentId }] }
        : { student_id: studentId }),
      ...(courseObjId
        ? { $or: [{ course_id: courseObjId }, { course_id: courseId }] }
        : { course_id: courseId }),
      batch_id: batchId,
    });
    if (!progress || (progress.progress_percent || 0) < 100) {
      return null;
    }

    const existing = await this.certificateModel.findOne({
      $or: [
        ...(studentObjId && courseObjId ? [{ student_id: studentObjId, course_id: courseObjId }] : []),
        { student_id: String(studentId), course_id: String(courseId) },
        ...(studentObjId ? [{ student_id: studentObjId, course_id: String(courseId) }] : []),
        ...(courseObjId ? [{ student_id: String(studentId), course_id: courseObjId }] : []),
      ],
    });
    if (existing) return existing;

    const [course, user] = await Promise.all([
      this.courseModel.findById(courseId).lean(),
      this.userModel.findById(studentId).lean(),
    ]);
    if (!course || !user) return null;

    const evalDetails = await this.computeEvaluationDetails(studentId, course);

    return this.certificateModel.create({
      student_id: studentObjId || studentId,
      course_id: courseObjId || courseId,
      course_name: course.course_name,
      student_name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Learner',
      issued_at: new Date(),
      certificate_code: `SKILLBUILD-${randomBytes(4).toString('hex').toUpperCase()}`,
      marks_obtained: evalDetails.marksObtained,
      total_marks: evalDetails.totalMarks,
      percentage: evalDetails.percentage,
      grade: evalDetails.grade,
      instructor_name: evalDetails.instructorName,
      organisation_name: 'SkillBuild LMS',
      evaluation_summary: evalDetails.evalSummary,
    });
  }

  async listForStudent(studentId: string) {
    const studentObjId = Types.ObjectId.isValid(studentId) ? new Types.ObjectId(studentId) : null;
    const studentFilter = studentObjId
      ? { $or: [{ student_id: studentObjId }, { student_id: studentId }] }
      : { student_id: studentId };

    const enrollments = await this.connection
      .collection('batch_enrolled_students')
      .find(studentFilter)
      .toArray();
    const enrolledCourseIds = new Set(
      enrollments.map((e) => String(e.course_id)).filter(Boolean),
    );

    let certs = await this.certificateModel
      .find(studentFilter)
      .sort({ issued_at: -1 })
      .lean();

    // Issue only for THIS student's completed enrollments.
    // A second $or must not replace the student filter, or every completed
    // course in the database is attached to the signed-in student.
    try {
      const issuedCourseIds = new Set(certs.map((c) => String(c.course_id)));
      const completedProgress = await this.connection
        .collection('course_progress')
        .find({
          $and: [
            studentFilter,
            { $or: [{ progress_percent: { $gte: 100 } }, { is_completed: true }] },
          ],
        })
        .toArray();

      for (const progress of completedProgress) {
        const cId = progress.course_id ? String(progress.course_id) : '';
        if (!cId || !enrolledCourseIds.has(cId) || issuedCourseIds.has(cId)) continue;
        try {
          await this.issueCertificate(studentId, cId);
          issuedCourseIds.add(cId);
        } catch {
          // ignore individual failures
        }
      }

      certs = await this.certificateModel
        .find(studentFilter)
        .sort({ issued_at: -1 })
        .lean();
    } catch {
      // non-blocking
    }

    const visible = certs.filter((c) => enrolledCourseIds.has(String(c.course_id)));

    return {
      status: true,
      data: visible.map((c: any) => ({
        certificate_id: String(c._id),
        course_id: String(c.course_id),
        course_name: c.course_name,
        student_name: c.student_name,
        issued_at: c.issued_at,
        certificate_code: c.certificate_code,
        marks_obtained: c.marks_obtained ?? null,
        total_marks: c.total_marks ?? null,
        percentage: c.percentage ?? null,
        grade: c.grade || 'Completed',
        instructor_name: c.instructor_name || null,
        organisation_name: c.organisation_name || 'SkillBuild LMS',
        evaluation_summary: c.evaluation_summary || null,
      })),
    };
  }

  async verify(code: string) {
    const cert = (await this.certificateModel.findOne({ certificate_code: code }).lean()) as any;
    if (!cert) throw new NotFoundException('Certificate not found or verification code is invalid');

    return {
      status: true,
      data: {
        ...cert,
        marks_obtained: cert.marks_obtained ?? null,
        total_marks: cert.total_marks ?? null,
        percentage: cert.percentage ?? null,
        grade: cert.grade || 'Completed',
        instructor_name: cert.instructor_name || null,
        organisation_name: cert.organisation_name || 'SkillBuild LMS',
        evaluation_summary: cert.evaluation_summary || null,
        is_valid: true,
        validity_status: '100% Authentic & Verified',
        verified_by: 'SkillBuild Credential Verification Authority',
        verified_at: new Date().toISOString(),
      },
    };
  }
}
