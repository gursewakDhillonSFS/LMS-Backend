import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Assignment, AssignmentDocument } from './schemas/assignment.schema';
import {
  AssignmentSubmission,
  AssignmentSubmissionDocument,
} from './schemas/assignment-submission.schema';
import { Course, CourseDocument } from '../course/schemas/course.schema';
import { User, UserDocument } from '../user/schemas/user.schema';
import { Schedule, ScheduleDocument } from '../schedule/schemas/schedule.schema';
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
    const filter: Record<string, unknown> = { batchId, ...dateFilter };

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

    // Allowed because teachers can perform CRUD on assignments within their assigned batches.

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

    // Allowed because teachers can perform CRUD on assignments within their assigned batches.

    await this.assignmentModel.findByIdAndDelete(id);

    // Also clean up all linked submissions
    await this.submissionModel.deleteMany({ assignmentId: assignment._id });

    return { status: true, message: 'Assignment deleted successfully' };
  }

  // ─── Get Submissions (Instructor View) ──────────────────────────────────────
  async getSubmissions(
    assignmentId: string,
    page = 1,
    limit = 10,
    search?: string,
  ) {
    const assignment = await this.assignmentModel.findById(assignmentId);
    if (!assignment) throw new NotFoundException('Assignment not found');

    const skip = (page - 1) * limit;

    // Fetch enrolled users in this batch, optionally filtered by search
    const userFilter: Record<string, unknown> = {};
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

    return {
      status: true,
      message: 'Submission graded successfully',
      data: updated,
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
