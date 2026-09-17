import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import { Quiz, QuizDocument } from './schemas/quiz.schema';
import {
  QuizSubmission,
  QuizSubmissionDocument,
} from './schemas/quiz-submission.schema';
import { Schedule, ScheduleDocument } from '../schedule/schemas/schedule.schema';
import { Course, CourseDocument } from '../course/schemas/course.schema';
import { User, UserDocument } from '../user/schemas/user.schema';
import { Announcement, AnnouncementDocument } from '../announcement/schemas/announcement.schema';
import { NotificationService } from '../notification/notification.service';
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

    @InjectModel(Announcement.name)
    private announcementModel: Model<AnnouncementDocument>,

    private notificationService: NotificationService,

    @InjectConnection()
    private connection: Connection,
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
      data: this.formatQuiz(quiz, true),
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

    const filter: Record<string, unknown> = { ...dateFilter };
    
    // If batchId is provided, match either the specific batch or the whole course (empty/null)
    if (batchId) {
      filter.$or = [
        { batchId: batchId },
        { batchId: '' },
        { batchId: null }
      ];
    }
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

        return { ...this.formatQuiz(q, false), submittedCount, totalMarks, studentSubmission };
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
  async findById(id: string, role?: string) {
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

    const includeAnswers = role === 'instructor' || role === 'teacher';

    return {
      status: true,
      data: {
        ...this.formatQuiz(quiz, includeAnswers),
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
      data: this.formatQuiz(updated, true),
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
  async getSubmissions(quizId: string, page = 1, limit = 10, search?: string, userId?: string, role?: string) {
    const quiz = await this.quizModel.findById(quizId);
    if (!quiz) throw new NotFoundException('Quiz not found');

    const totalMarks = (quiz.questions || []).reduce(
      (sum, q) => sum + (q.marks || 0),
      0,
    );

    const skip = (page - 1) * limit;

    const userFilter: Record<string, unknown> = { role: 'student' };
    
    if (role === 'teacher' && userId) {
      const teacher = await this.userModel.findById(userId);
      if (teacher && teacher.batchIds && teacher.batchIds.length > 0) {
        userFilter.batchIds = { $in: teacher.batchIds };
      } else {
        userFilter.batchIds = null;
      }
    } else if (quiz.batchId) {
      userFilter.batchIds = new Types.ObjectId(quiz.batchId);
    } else {
      const course = await this.courseModel.findById(quiz.courseId);
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

  // ─── Grade Submission (Essay manual feedback + marks) ─────────────────────────────────
  async gradeSubmission(dto: GradeQuizSubmissionDto) {
    const submission = await this.submissionModel.findById(dto.submissionId);
    if (!submission) throw new NotFoundException('Submission not found');

    const quiz = await this.quizModel.findById(submission.quizId);
    if (!quiz) throw new NotFoundException('Quiz not found');

    const answers = [...(submission.answers || [])];
    if (dto.essayMarks?.length) {
      for (const mark of dto.essayMarks) {
        const idx = answers.findIndex(
          (a) => a.questionIndex === mark.questionIndex,
        );
        if (idx === -1) continue;
        const question = quiz.questions[mark.questionIndex];
        const maxMarks = question?.marks || 0;
        const obtained = Math.max(0, Math.min(mark.obtainedMarks, maxMarks));
        answers[idx] = {
          ...answers[idx],
          obtainedMarks: obtained,
          isCorrect: obtained > 0,
        };
      }
    }

    const obtainedScore = answers.reduce(
      (sum, a) => sum + (a.obtainedMarks || 0),
      0,
    );

    const updated = await this.submissionModel.findByIdAndUpdate(
      dto.submissionId,
      {
        answers,
        obtainedScore,
        ...(dto.feedback !== undefined && { feedback: dto.feedback }),
        status: 'Graded',
      },
      { new: true },
    );

    // Notify student
    try {
      await this.notificationService.createNotification({
        recipient_id: submission.studentId,
        course_id: quiz.courseId,
        batch_id: quiz.batchId,
        title: 'Quiz Graded',
        message: `Your quiz "${quiz.quizName}" has been graded. Score: ${obtainedScore}/${submission.totalMarks || 100}`,
        type: 'grade',
        link: `/my-courses/course-details/quiz-result?quiz_id=${quiz._id}&course_id=${quiz.courseId}&batch_id=${quiz.batchId}`,
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
      } else if (question && a.questionType === 'essay' && question.correctAnswer) {
        // Auto-evaluate text/essay
        isCorrect = a.submittedText?.trim().toLowerCase() === question.correctAnswer.trim().toLowerCase();
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

    const student = await this.userModel.findById(studentId).lean();
    const course = await this.courseModel.findById(quiz.courseId).lean();
    const studentName = student
      ? `${student.firstName || ''} ${student.lastName || ''}`.trim()
      : 'A student';
    const courseTitle = course?.course_name || 'Course';

    // 1. Create announcement for course & batch
    try {
      const instructorId = course?.instructor_id || course?.head_teacher || new Types.ObjectId(studentId);
      await this.announcementModel.create({
        title: `New Quiz Submission: ${quiz.quizName}`,
        message: `${studentName} has submitted "${quiz.quizName}" for ${courseTitle}. Score: ${obtainedScore}/${totalMarks}. Please review grading and feedback.`,
        courseId: quiz.courseId,
        batchId: quiz.batchId ? String(quiz.batchId) : null,
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
      const batchObj = (course?.batch || []).find((b: any) => String(b._id) === String(quiz.batchId));
      if (batchObj?.teacher) recipients.push(String(batchObj.teacher));

      const uniqueRecipients = Array.from(new Set(recipients));
      for (const recId of uniqueRecipients) {
        await this.notificationService.createNotification({
          recipient_id: recId,
          sender_id: studentId,
          course_id: quiz.courseId,
          batch_id: quiz.batchId,
          title: 'New Quiz Submission',
          message: `${studentName} submitted quiz "${quiz.quizName}" for ${courseTitle} (Score: ${obtainedScore}/${totalMarks}).`,
          type: 'submission',
          link: `/quizzes/batch-details/test-details?quiz_id=${quiz._id}&course_id=${quiz.courseId}&batch_id=${quiz.batchId}`,
        });
      }
    } catch {
      // notification is best-effort
    }

    // Update course progress
    try {
      await this.connection.collection('course_progress').updateOne(
        {
          student_id: new Types.ObjectId(studentId),
          course_id: quiz.courseId,
          batch_id: quiz.batchId,
        },
        {
          $addToSet: { completed_quizzes: quiz._id },
          $setOnInsert: {
            completed_materials: [],
            completed_assignments: [],
            progress_percent: 0,
            completed_at: null,
          },
        },
        { upsert: true },
      );
    } catch {
      // best-effort
    }

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
  private formatQuiz(q: QuizDocument, includeAnswers = false) {
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
      questions: (q.questions || []).map((qu) => ({
        questionType: qu.questionType,
        question: qu.question,
        marks: qu.marks,
        options: qu.options || [],
        ...(includeAnswers
          ? {
              correctOption: qu.correctOption,
              correctAnswer: qu.correctAnswer,
            }
          : {}),
      })),
      status: q.status,
      createdAt: (q as unknown as { createdAt?: Date }).createdAt,
    };
  }
}
