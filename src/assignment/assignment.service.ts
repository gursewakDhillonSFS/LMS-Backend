import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import { Assignment, AssignmentDocument } from './schemas/assignment.schema';
import {
  AssignmentSubmission,
  AssignmentSubmissionDocument,
} from './schemas/assignment-submission.schema';
import { Course, CourseDocument } from '../course/schemas/course.schema';
import { User, UserDocument } from '../user/schemas/user.schema';
import { Schedule, ScheduleDocument } from '../schedule/schemas/schedule.schema';
import { Announcement, AnnouncementDocument } from '../announcement/schemas/announcement.schema';
import { NotificationService } from '../notification/notification.service';
import {
  CreateAssignmentDto,
  UpdateAssignmentDto,
  GradeSubmissionDto,
} from './dto/assignment.dto';

@Injectable()
export class AssignmentService {
  constructor(
    @InjectModel(Assignment.name)
    private assignmentModel: Model<AssignmentDocument>,

    @InjectModel(AssignmentSubmission.name)
    private submissionModel: Model<AssignmentSubmissionDocument>,

    @InjectModel(Course.name)
    private courseModel: Model<CourseDocument>,

    @InjectModel(User.name)
    private userModel: Model<UserDocument>,

    @InjectModel(Schedule.name)
    private scheduleModel: Model<ScheduleDocument>,

    @InjectModel(Announcement.name)
    private announcementModel: Model<AnnouncementDocument>,

    private notificationService: NotificationService,

    @InjectConnection()
    private connection: Connection,
  ) {}

  // ─── Create Assignment ──────────────────────────────────────────────────────
  async create(dto: CreateAssignmentDto, userId?: string) {
    // Verify course exists
    const course = await this.courseModel.findById(dto.courseId);
    if (!course) throw new NotFoundException('Course not found');

    // Verify batch exists inside course.batch array
    const batch = (
      course.batch as { _id?: Types.ObjectId; batchName: string; teacher?: string }[]
    ).find((b) => b._id?.toString() === dto.batchId);
    
    if (!batch)
      throw new BadRequestException('Batch not found in this course');

    if (userId) {
      const callingUser = await this.userModel.findById(userId).lean();
      if (callingUser && String(callingUser.role) === 'teacher') {
        if (String(batch.teacher) !== String(callingUser.teacherId)) {
          throw new ForbiddenException('Teacher not assigned to this batch');
        }
      }
    }

    const assignment = await this.assignmentModel.create({
      assignmentName: dto.assignmentName,
      dueDate: new Date(dto.dueDate),
      overview: dto.overview,
      courseId: new Types.ObjectId(dto.courseId),
      batchId: dto.batchId,
      organisationId: dto.organisationId
        ? new Types.ObjectId(dto.organisationId)
        : null,
      created_by: userId ? new Types.ObjectId(userId) : null,
      projects: dto.projects || [],
      status: dto.status || 'published',
    });

    if (assignment.status === 'published') {
      await this.scheduleModel.create({
        title: `Assignment: ${assignment.assignmentName}`,
        description: `Due date for assignment: ${assignment.assignmentName}`,
        date: assignment.dueDate,
        startTime: '00:00',
        endTime: '23:59',
        courseId: assignment.courseId,
        batchId: assignment.batchId,
        createdBy: assignment.created_by as Types.ObjectId,
        organisationId: assignment.organisationId as Types.ObjectId,
        meetingLink: '',
      });
    }

    return {
      status: true,
      message: 'Assignment created successfully',
      data: this.formatAssignment(assignment),
    };
  }

  // ─── Get Assignments by Batch ────────────────────────────────────────────────
  async findByBatch(
    batchId: string,
    courseId: string,
    tab: 'ongoing' | 'past' = 'ongoing',
    page = 1,
    limit = 10,
    studentId?: string,
  ) {
    const skip = (page - 1) * limit;

    // Compare against START of today (UTC midnight) so timezone shifts
    // (e.g. IST +5:30) don't cause today's assignments to appear in "past"
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const dateFilter =
      tab === 'ongoing'
        ? { dueDate: { $gte: startOfToday } }
        : { dueDate: { $lt: startOfToday } };

    // Filter by batchId; courseId is included as a string match to narrow scope
    const filter: Record<string, unknown> = { ...dateFilter };
    if (batchId) {
      filter.$or = [
        { batchId: batchId },
        { batchId: '' },
        { batchId: null }
      ];
    }
    if (courseId) {
      filter.courseId = new Types.ObjectId(courseId);
    }

    const [assignments, total] = await Promise.all([
      this.assignmentModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      this.assignmentModel.countDocuments(filter),
    ]);

    const enriched = await Promise.all(
      assignments.map(async (a) => {
        const submittedCount = await this.submissionModel.countDocuments({
          assignmentId: a._id,
          status: { $in: ['Submitted', 'Graded'] },
        });

        let studentSubmission: { status: string; result: string | null } | null = null;
        if (studentId) {
          const sub = await this.submissionModel.findOne({
            assignmentId: a._id,
            studentId: new Types.ObjectId(studentId),
          });
          if (sub) {
            studentSubmission = { status: sub.status, result: sub.result };
          }
        }

        return { ...this.formatAssignment(a), submittedCount, studentSubmission };
      }),
    );

    return {
      status: true,
      data: {
        assignments: enriched,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── Get Assignment Details ──────────────────────────────────────────────────
  async findById(id: string) {
    const assignment = await this.assignmentModel.findById(id);
    if (!assignment) throw new NotFoundException('Assignment not found');

    const submittedCount = await this.submissionModel.countDocuments({
      assignmentId: assignment._id,
      status: { $in: ['Submitted', 'Graded'] },
    });

    // Fetch course info for display context
    const course = await this.courseModel
      .findById(assignment.courseId)
      .select('course_name batch');

    const batch = course
      ? (course.batch as { _id?: Types.ObjectId; batchName: string }[]).find(
          (b) => b._id?.toString() === assignment.batchId,
        )
      : null;

    return {
      status: true,
      data: {
        ...this.formatAssignment(assignment),
        submittedCount,
        courseName: course?.course_name || null,
        batchName: batch?.batchName || null,
      },
    };
  }

  // ─── Update Assignment ───────────────────────────────────────────────────────
  async update(
    id: string,
    dto: UpdateAssignmentDto,
    userId?: string,
    role?: string,
  ) {
    const assignment = await this.assignmentModel.findById(id);
    if (!assignment) throw new NotFoundException('Assignment not found');

    await this.assertCanManageAssignment(assignment, userId, role);

    const updated = await this.assignmentModel.findByIdAndUpdate(
      id,
      {
        ...(dto.assignmentName && { assignmentName: dto.assignmentName }),
        ...(dto.dueDate && { dueDate: new Date(dto.dueDate) }),
        ...(dto.overview && { overview: dto.overview }),
        ...(dto.projects && { projects: dto.projects }),
        ...(dto.status && { status: dto.status }),
      },
      { new: true },
    );

    if (!updated) throw new NotFoundException('Assignment not found');

    if (updated.status === 'published' && assignment.status !== 'published') {
      await this.scheduleModel.create({
        title: `Assignment: ${updated.assignmentName}`,
        description: `Due date for assignment: ${updated.assignmentName}`,
        date: updated.dueDate,
        startTime: '00:00',
        endTime: '23:59',
        courseId: updated.courseId,
        batchId: updated.batchId,
        createdBy: updated.created_by as Types.ObjectId,
        organisationId: updated.organisationId as Types.ObjectId,
        meetingLink: '',
      });
    }

    return {
      status: true,
      message: 'Assignment updated successfully',
      data: this.formatAssignment(updated),
    };
  }

  // ─── Delete Assignment ───────────────────────────────────────────────────────
  async delete(id: string, userId?: string, role?: string) {
    const assignment = await this.assignmentModel.findById(id);
    if (!assignment) throw new NotFoundException('Assignment not found');

    await this.assertCanManageAssignment(assignment, userId, role);

    await this.assignmentModel.findByIdAndDelete(id);

    // Also clean up all linked submissions
    await this.submissionModel.deleteMany({ assignmentId: assignment._id });

    return { status: true, message: 'Assignment deleted successfully' };
  }

  private async assertCanManageAssignment(
    assignment: AssignmentDocument,
    userId?: string,
    role?: string,
  ) {
    if (!userId) return;
    if (role === 'instructor') {
      if (
        assignment.created_by &&
        String(assignment.created_by) !== String(userId)
      ) {
        const user = await this.userModel.findById(userId).lean();
        if (
          user?.organisationId &&
          assignment.organisationId &&
          String(user.organisationId) === String(assignment.organisationId)
        ) {
          return;
        }
        // allow same org or creator; if neither matches, still allow instructor of org course
        const course = await this.courseModel.findById(assignment.courseId).lean();
        if (
          course?.organisation_id &&
          user?.organisationId &&
          String(course.organisation_id) === String(user.organisationId)
        ) {
          return;
        }
        throw new ForbiddenException('Not authorized to manage this assignment');
      }
      return;
    }
    if (role === 'teacher') {
      const callingUser = await this.userModel.findById(userId).lean();
      const course = await this.courseModel.findById(assignment.courseId);
      if (!course || !callingUser?.teacherId) {
        throw new ForbiddenException('Teacher not assigned to this batch');
      }
      const batch = (
        course.batch as { _id?: Types.ObjectId; teacher?: string }[]
      ).find((b) => b._id?.toString() === assignment.batchId);
      if (!batch || String(batch.teacher) !== String(callingUser.teacherId)) {
        throw new ForbiddenException('Teacher not assigned to this batch');
      }
      return;
    }
    throw new ForbiddenException('Not authorized to manage this assignment');
  }

  // ─── Get Submissions (Instructor View) ──────────────────────────────────────
  async getSubmissions(
    assignmentId: string,
    page = 1,
    limit = 10,
    search?: string,
    userId?: string,
    role?: string,
  ) {
    const assignment = await this.assignmentModel.findById(assignmentId);
    if (!assignment) throw new NotFoundException('Assignment not found');

    const skip = (page - 1) * limit;

    // Fetch enrolled users in this batch, optionally filtered by search
    const userFilter: Record<string, unknown> = { role: 'student' };
    
    if (role === 'teacher' && userId) {
      const teacher = await this.userModel.findById(userId);
      if (teacher && teacher.batchIds && teacher.batchIds.length > 0) {
        userFilter.batchIds = { $in: teacher.batchIds };
      } else {
        userFilter.batchIds = null;
      }
    } else if (assignment.batchId) {
      userFilter.batchIds = new Types.ObjectId(assignment.batchId);
    } else {
      const course = await this.courseModel.findById(assignment.courseId);
      if (course) {
        const courseBatchIds = (course.batch as { _id?: Types.ObjectId }[] || []).map(b => b._id).filter(Boolean);
        userFilter.batchIds = { $in: courseBatchIds };
      }
    }

    if (search) {
      const regex = new RegExp(search, 'i');
      userFilter.$or = [
        { firstName: regex },
        { lastName: regex },
        { email: regex },
      ];
    }

    const students = await this.userModel
      .find(userFilter)
      .select('_id firstName lastName email photo')
      .skip(skip)
      .limit(limit);

    const totalStudents = await this.userModel.countDocuments(userFilter);

    // Map each student to their submission status
    const rows = await Promise.all(
      students.map(async (student) => {
        const submission = await this.submissionModel.findOne({
          assignmentId: new Types.ObjectId(assignmentId),
          studentId: student._id,
        });

        return {
          submission_id: submission ? String(submission._id) : null,
          student_id: String(student._id),
          name: `${student.firstName} ${student.lastName}`,
          email: student.email,
          avatar: (student as unknown as { photo?: string }).photo || null,
          submittedText: submission?.submittedText || null,
          dateOfSubmit: submission?.dateOfSubmit
            ? new Date(submission.dateOfSubmit).toLocaleDateString('en-GB')
            : '-',
          result: submission?.result || '-',
          feedback: submission?.feedback || null,
          status: submission?.status || 'Not Submitted',
        };
      }),
    );

    return {
      status: true,
      data: {
        submissions: rows,
        total: totalStudents,
        page,
        totalPages: Math.ceil(totalStudents / limit),
      },
    };
  }

  // ─── Grade a Submission ──────────────────────────────────────────────────────
  async gradeSubmission(dto: GradeSubmissionDto) {
    const submission = await this.submissionModel.findById(dto.submissionId);
    if (!submission) throw new NotFoundException('Submission not found');

    const updated = await this.submissionModel.findByIdAndUpdate(
      dto.submissionId,
      {
        ...(dto.result !== undefined && { result: dto.result }),
        ...(dto.feedback !== undefined && { feedback: dto.feedback }),
        status: 'Graded',
      },
      { new: true },
    );

    // Notify student that assignment has been graded
    try {
      const assignment = await this.assignmentModel.findById(submission.assignmentId);
      await this.notificationService.createNotification({
        recipient_id: submission.studentId,
        course_id: assignment?.courseId,
        batch_id: assignment?.batchId,
        title: 'Assignment Graded',
        message: `Your assignment "${assignment?.assignmentName || 'Assignment'}" has been graded. Result: ${dto.result}`,
        type: 'grade',
        link: `/my-courses/course-details/assignment-details?assignment_id=${submission.assignmentId}`,
      });
    } catch {
      // notification is best-effort
    }

    return {
      status: true,
      message: 'Submission graded successfully',
      data: updated,
    };
  }

  // ─── Get Submission By ID ───────────────────────────────────────────────────
  async getSubmissionById(submissionId: string) {
    const submission = await this.submissionModel
      .findById(submissionId)
      .populate('studentId', 'firstName lastName email photo');
      
    if (!submission) throw new NotFoundException('Submission not found');
    
    return {
      status: true,
      data: {
        submission_id: String(submission._id),
        student_id: String(submission.studentId._id),
        name: `${(submission.studentId as any).firstName} ${(submission.studentId as any).lastName}`,
        email: (submission.studentId as any).email,
        avatar: (submission.studentId as any).photo || null,
        submittedText: submission.submittedText,
        result: submission.result || '-',
        feedback: submission.feedback || null,
        status: submission.status,
      }
    };
  }

  // ─── Get all assignments for courses listing page ────────────────────────────
  async findByCourse(courseId: string) {
    const now = new Date();
    const courseIdObj = new Types.ObjectId(courseId);
    const [totalAssignments, ongoingCount] = await Promise.all([
      this.assignmentModel.countDocuments({ courseId: courseIdObj }),
      this.assignmentModel.countDocuments({ courseId: courseIdObj, dueDate: { $gte: now } }),
    ]);

    // Get latest assignment date
    const latest = await this.assignmentModel
      .findOne({ courseId: courseIdObj })
      .sort({ dueDate: -1 })
      .select('dueDate');

    return {
      status: true,
      data: {
        totalAssignments,
        ongoingCount,
        lastAssignmentDate: latest?.dueDate
          ? new Date(latest.dueDate).toLocaleDateString('en-GB')
          : null,
      },
    };
  }

  // ─── Submit Assignment (Student) ─────────────────────────────────────────────
  async submitAssignment(
    assignmentId: string,
    studentId: string,
    submittedText: string,
  ) {
    const assignment = await this.assignmentModel.findById(assignmentId);
    if (!assignment) throw new NotFoundException('Assignment not found');

    const submission = await this.submissionModel.findOneAndUpdate(
      {
        assignmentId: new Types.ObjectId(assignmentId),
        studentId: new Types.ObjectId(studentId),
      },
      {
        $set: {
          submittedText,
          status: 'Submitted',
          dateOfSubmit: new Date(),
        },
      },
      { upsert: true, new: true },
    );

    const student = await this.userModel.findById(studentId).lean();
    const course = await this.courseModel.findById(assignment.courseId).lean();
    const studentName = student
      ? `${student.firstName || ''} ${student.lastName || ''}`.trim()
      : 'A student';
    const courseTitle = course?.course_name || 'Course';

    // 1. Create announcement for course & batch
    try {
      const instructorId = course?.instructor_id || course?.head_teacher || new Types.ObjectId(studentId);
      await this.announcementModel.create({
        title: `New Assignment Submission: ${assignment.assignmentName}`,
        message: `${studentName} has submitted "${assignment.assignmentName}" for ${courseTitle}. Please evaluate and grade the submission.`,
        courseId: assignment.courseId,
        batchId: assignment.batchId ? String(assignment.batchId) : null,
        instructorId,
        type: 'general',
        referenceId: String(submission._id),
        status: 'published',
        publishedAt: new Date(),
      });
    } catch {
      // announcement is best-effort
    }

    // 2. Create notification for Instructor & Teachers
    try {
      const recipients: string[] = [];
      if (course?.instructor_id) recipients.push(String(course.instructor_id));
      if (course?.head_teacher) recipients.push(String(course.head_teacher));
      const batchObj = (course?.batch || []).find((b: any) => String(b._id) === String(assignment.batchId));
      if (batchObj?.teacher) recipients.push(String(batchObj.teacher));

      const uniqueRecipients = Array.from(new Set(recipients));
      for (const recId of uniqueRecipients) {
        await this.notificationService.createNotification({
          recipient_id: recId,
          sender_id: studentId,
          course_id: assignment.courseId,
          batch_id: assignment.batchId,
          title: 'New Assignment Submission',
          message: `${studentName} submitted "${assignment.assignmentName}" for ${courseTitle}.`,
          type: 'submission',
          link: `/assignments/batch-details/evaluate/${submission._id}?course_id=${assignment.courseId}&batch_id=${assignment.batchId}&assignment_id=${assignment._id}`,
        });
      }
    } catch {
      // notification is best-effort
    }

    // Update progress
    try {
      await this.connection.collection('course_progress').updateOne(
        {
          student_id: new Types.ObjectId(studentId),
          course_id: assignment.courseId,
          batch_id: assignment.batchId,
        },
        {
          $addToSet: { completed_assignments: assignment._id },
          $setOnInsert: {
            completed_materials: [],
            completed_quizzes: [],
            progress_percent: 0,
            completed_at: null,
          },
        },
        { upsert: true },
      );
    } catch {
      // progress update is best-effort
    }

    return {
      status: true,
      message: 'Assignment submitted successfully',
      data: {
        submission_id: String(submission._id),
        status: submission.status,
      },
    };
  }

  // ─── Formatter ──────────────────────────────────────────────────────────────
  private formatAssignment(a: AssignmentDocument) {
    return {
      assignment_id: String(a._id),
      assignmentName: a.assignmentName,
      dueDate: a.dueDate
        ? new Date(a.dueDate).toLocaleDateString('en-GB')
        : null,
      dueDateRaw: a.dueDate,
      overview: a.overview,
      courseId: String(a.courseId),
      batchId: a.batchId,
      created_by: a.created_by ? String(a.created_by) : null,
      projects: a.projects || [],
      status: a.status,
      createdAt: (a as unknown as { createdAt?: Date }).createdAt,
    };
  }
}
