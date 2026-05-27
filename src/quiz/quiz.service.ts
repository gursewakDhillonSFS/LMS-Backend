import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Quiz, QuizDocument } from './schemas/quiz.schema';
import {
  QuizSubmission,
  QuizSubmissionDocument,
} from './schemas/quiz-submission.schema';
import { Schedule, ScheduleDocument } from '../schedule/schemas/schedule.schema';
import { Course, CourseDocument } from '../course/schemas/course.schema';
import { User, UserDocument } from '../user/schemas/user.schema';
import {
  CreateQuizDto,
  UpdateQuizDto,
  GradeQuizSubmissionDto,
} from './dto/quiz.dto';

@Injectable()
export class QuizService {
  constructor(
    @InjectModel(Quiz.name)
    private quizModel: Model<QuizDocument>,

    @InjectModel(QuizSubmission.name)
    private submissionModel: Model<QuizSubmissionDocument>,

    @InjectModel(Schedule.name)
    private scheduleModel: Model<ScheduleDocument>,

    @InjectModel(Course.name)
    private courseModel: Model<CourseDocument>,

    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
  ) {}

  // ─── Create Quiz ─────────────────────────────────────────────────────────────
  async create(dto: CreateQuizDto, userId?: string) {
    const course = await this.courseModel.findById(dto.courseId);
    if (!course) throw new NotFoundException('Course not found');

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

    const quiz = await this.quizModel.create({
      quizName: dto.quizName,
      dueDate: new Date(dto.dueDate),
      quizType: dto.quizType,
      overview: dto.overview,
      enableTimer: dto.enableTimer ?? false,
      ...(dto.timer && { timer: dto.timer }),
      courseId: new Types.ObjectId(dto.courseId),
      batchId: dto.batchId,
      ...(dto.organisationId && {
        organisationId: new Types.ObjectId(dto.organisationId),
      }),
      created_by: userId ? new Types.ObjectId(userId) : null,
      questions: dto.questions || [],
      status: dto.status || 'published',
    });

    if (quiz.status === 'published') {
      await this.scheduleModel.create({
        title: `Quiz: ${quiz.quizName}`,
        description: `Due date for quiz: ${quiz.quizName}`,
        date: quiz.dueDate,
        startTime: '00:00',
        endTime: '23:59',
        courseId: quiz.courseId,
        batchId: quiz.batchId,
        createdBy: quiz.created_by as Types.ObjectId,
        organisationId: (quiz as any).organisationId as Types.ObjectId,
        meetingLink: '',
      });
    }

    return {
      status: true,
      message: 'Quiz created successfully',
      data: this.formatQuiz(quiz),
    };
  }

  // ─── Get Quizzes by Batch ─────────────────────────────────────────────────────
  async findByBatch(
    batchId: string,
    tab: 'ongoing' | 'past' = 'ongoing',
    page = 1,
    limit = 10,
    studentId?: string,
    courseId?: string,
  ) {
    const skip = (page - 1) * limit;

    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const dateFilter =
      tab === 'ongoing'
        ? { dueDate: { $gte: startOfToday } }
        : { dueDate: { $lt: startOfToday } };

    const filter: Record<string, unknown> = { batchId, ...dateFilter };
    if (courseId && Types.ObjectId.isValid(courseId)) {
      filter.courseId = new Types.ObjectId(courseId);
    }

    const [quizzes, total] = await Promise.all([
      this.quizModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      this.quizModel.countDocuments(filter),
    ]);

    const enriched = await Promise.all(
      quizzes.map(async (q) => {
        const submittedCount = await this.submissionModel.countDocuments({
          quizId: q._id,
          status: { $in: ['Submitted', 'Graded'] },
        });
        const totalMarks = (q.questions || []).reduce(
          (sum, qu) => sum + (qu.marks || 0),
          0,
        );

        let studentSubmission: { status: string; obtainedScore: number; totalMarks: number } | null = null;
        if (studentId) {
          const sub = await this.submissionModel.findOne({
            quizId: q._id,
            studentId: new Types.ObjectId(studentId),
          });
          if (sub) {
            studentSubmission = { status: sub.status, obtainedScore: sub.obtainedScore, totalMarks };
          }
        }

        return { ...this.formatQuiz(q), submittedCount, totalMarks, studentSubmission };
      }),
    );

    return {
      status: true,
      data: {
        quizzes: enriched,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── Get Quiz Details ─────────────────────────────────────────────────────────
  async findById(id: string) {
    const quiz = await this.quizModel.findById(id);
    if (!quiz) throw new NotFoundException('Quiz not found');

    const submittedCount = await this.submissionModel.countDocuments({
      quizId: quiz._id,
      status: { $in: ['Submitted', 'Graded'] },
    });

    const course = await this.courseModel
      .findById(quiz.courseId)
      .select('course_name batch');

    const batch = course
      ? (course.batch as { _id?: Types.ObjectId; batchName: string }[]).find(
          (b) => b._id?.toString() === quiz.batchId,
        )
      : null;

    const totalMarks = (quiz.questions || []).reduce(
      (sum, q) => sum + (q.marks || 0),
      0,
    );

    return {
      status: true,
      data: {
        ...this.formatQuiz(quiz),
        submittedCount,
        totalMarks,
        courseName: course?.course_name || null,
        batchName: batch?.batchName || null,
      },
    };
  }

  // ─── Update Quiz ──────────────────────────────────────────────────────────────
  async update(id: string, dto: UpdateQuizDto, userId?: string, role?: string) {
    const quiz = await this.quizModel.findById(id);
    if (!quiz) throw new NotFoundException('Quiz not found');

    // Allowed because teachers can perform CRUD on quizzes within their assigned batches.

    const updated = await this.quizModel.findByIdAndUpdate(
      id,
      {
        ...(dto.quizName && { quizName: dto.quizName }),
        ...(dto.dueDate && { dueDate: new Date(dto.dueDate) }),
        ...(dto.quizType && { quizType: dto.quizType }),
        ...(dto.overview && { overview: dto.overview }),
        ...(dto.enableTimer !== undefined && { enableTimer: dto.enableTimer }),
        ...(dto.timer !== undefined && { timer: dto.timer }),
        ...(dto.questions && { questions: dto.questions }),
        ...(dto.status && { status: dto.status }),
      },
      { new: true },
    );

    if (!updated) throw new NotFoundException('Quiz not found after update');

    if (updated.status === 'published' && quiz.status !== 'published') {
      await this.scheduleModel.create({
        title: `Quiz: ${updated.quizName}`,
        description: `Due date for quiz: ${updated.quizName}`,
        date: updated.dueDate,
        startTime: '00:00',
        endTime: '23:59',
        courseId: updated.courseId,
        batchId: updated.batchId,
        createdBy: updated.created_by as Types.ObjectId,
        organisationId: (updated as any).organisationId as Types.ObjectId,
        meetingLink: '',
      });
    }

    return {
      status: true,
      message: 'Quiz updated successfully',
      data: this.formatQuiz(updated),
    };
  }

  // ─── Delete Quiz ──────────────────────────────────────────────────────────────
  async delete(id: string, userId?: string, role?: string) {
    const quiz = await this.quizModel.findById(id);
    if (!quiz) throw new NotFoundException('Quiz not found');

    // Allowed because teachers can perform CRUD on quizzes within their assigned batches.

    await this.quizModel.findByIdAndDelete(id);
    await this.submissionModel.deleteMany({ quizId: quiz._id });

    return { status: true, message: 'Quiz deleted successfully' };
  }

  // ─── Get Submissions (Instructor View) ────────────────────────────────────────
  async getSubmissions(quizId: string, page = 1, limit = 10, search?: string) {
    const quiz = await this.quizModel.findById(quizId);
    if (!quiz) throw new NotFoundException('Quiz not found');

    const totalMarks = (quiz.questions || []).reduce(
      (sum, q) => sum + (q.marks || 0),
      0,
    );

    const skip = (page - 1) * limit;

    const userFilter: Record<string, unknown> = {};
    if (search) {
      const regex = new RegExp(search, 'i');
      userFilter.$or = [
        { firstName: regex },
        { lastName: regex },
        { email: regex },
      ];
    }

    const [students, totalStudents] = await Promise.all([
      this.userModel
        .find(userFilter)
        .select('_id firstName lastName email photo')
        .skip(skip)
        .limit(limit),
      this.userModel.countDocuments(userFilter),
    ]);

    const rows = await Promise.all(
      students.map(async (student) => {
        const submission = await this.submissionModel.findOne({
          quizId: new Types.ObjectId(quizId),
          studentId: student._id,
        });

        return {
          submission_id: submission ? String(submission._id) : null,
          student_id: String(student._id),
          name: `${student.firstName} ${student.lastName}`,
          email: student.email,
          avatar: (student as unknown as { photo?: string }).photo || null,
          dateOfSubmit: submission?.dateOfSubmit
            ? new Date(submission.dateOfSubmit).toLocaleDateString('en-GB')
            : '-',
          result: submission
            ? `${submission.obtainedScore}/${totalMarks}`
            : '-',
          feedback: submission?.feedback || null,
          status: submission?.status || 'Not Started',
          answers: submission?.answers || [],
        };
      }),
    );

    return {
      status: true,
      data: {
        submissions: rows,
        totalMarks,
        total: totalStudents,
        page,
        totalPages: Math.ceil(totalStudents / limit),
      },
    };
  }

  // ─── Grade Submission (Essay manual feedback) ─────────────────────────────────
  async gradeSubmission(dto: GradeQuizSubmissionDto) {
    const submission = await this.submissionModel.findById(dto.submissionId);
    if (!submission) throw new NotFoundException('Submission not found');

    const updated = await this.submissionModel.findByIdAndUpdate(
      dto.submissionId,
      {
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

  // ─── Course Summary (for quizzes listing page) ────────────────────────────────
  async findByCourse(courseId: string) {
    const now = new Date();
    const courseIdObj = new Types.ObjectId(courseId);
    const [totalQuizzes, ongoingCount] = await Promise.all([
      this.quizModel.countDocuments({ courseId: courseIdObj }),
      this.quizModel.countDocuments({ courseId: courseIdObj, dueDate: { $gte: now } }),
    ]);

    const latest = await this.quizModel
      .findOne({ courseId: courseIdObj })
      .sort({ dueDate: -1 })
      .select('dueDate');

    return {
      status: true,
      data: {
        totalQuizzes,
        ongoingCount,
        lastQuizDate: latest?.dueDate
          ? new Date(latest.dueDate).toLocaleDateString('en-GB')
          : null,
      },
    };
  }

  // ─── Submit Quiz (Student) ────────────────────────────────────────────────────
  async submitQuiz(
    quizId: string,
    studentId: string,
    answers: {
      questionIndex: number;
      questionType: 'mcq' | 'essay';
      selectedOption?: string;
      submittedText?: string;
    }[],
  ) {
    const quiz = await this.quizModel.findById(quizId);
    if (!quiz) throw new NotFoundException('Quiz not found');

    const totalMarks = (quiz.questions || []).reduce(
      (sum, q) => sum + (q.marks || 0),
      0,
    );

    // Auto-grade each answer
    const gradedAnswers = answers.map((a) => {
      const question = quiz.questions[a.questionIndex];
      let isCorrect = false;
      let obtainedMarks = 0;

      if (question && a.questionType === 'mcq') {
        isCorrect = a.selectedOption === question.correctOption;
        obtainedMarks = isCorrect ? (question.marks || 0) : 0;
      }

      return {
        questionIndex: a.questionIndex,
        questionType: a.questionType,
        selectedOption: a.selectedOption || '',
        submittedText: a.submittedText || '',
        isCorrect,
        obtainedMarks,
      };
    });

    const obtainedScore = gradedAnswers.reduce(
      (sum, a) => sum + a.obtainedMarks,
      0,
    );

    const submission = await this.submissionModel.findOneAndUpdate(
      {
        quizId: new Types.ObjectId(quizId),
        studentId: new Types.ObjectId(studentId),
      },
      {
        $set: {
          answers: gradedAnswers,
          totalMarks,
          obtainedScore,
          status: 'Submitted',
          dateOfSubmit: new Date(),
        },
      },
      { upsert: true, new: true },
    );

    return {
      status: true,
      message: 'Quiz submitted successfully',
      data: {
        submission_id: String(submission._id),
        obtainedScore,
        totalMarks,
        status: submission.status,
      },
    };
  }

  // ─── Formatter ────────────────────────────────────────────────────────────────
  private formatQuiz(q: QuizDocument) {
    return {
      quiz_id: String(q._id),
      quizName: q.quizName,
      dueDate: q.dueDate
        ? new Date(q.dueDate).toLocaleDateString('en-GB')
        : null,
      dueDateRaw: q.dueDate,
      quizType: q.quizType,
      overview: q.overview,
      enableTimer: q.enableTimer,
      timer: q.timer,
      courseId: String(q.courseId),
      batchId: q.batchId,
      created_by: q.created_by ? String(q.created_by) : null,
      // Return questions WITHOUT correctOption/correctAnswer (don't expose answers to listing)
      questions: (q.questions || []).map((qu) => ({
        questionType: qu.questionType,
        question: qu.question,
        marks: qu.marks,
        options: qu.options || [],
        // Only expose correct answers to instructor (details endpoint)
        correctOption: qu.correctOption,
        correctAnswer: qu.correctAnswer,
      })),
      status: q.status,
      createdAt: (q as unknown as { createdAt?: Date }).createdAt,
    };
  }
}
