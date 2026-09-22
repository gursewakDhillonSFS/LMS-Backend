import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import {
  Announcement,
  AnnouncementDocument,
} from './schemas/announcement.schema';
import {
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
} from './dto/announcement.dto';
import { Course, CourseDocument } from '../course/schemas/course.schema';
import { User, UserDocument } from '../user/schemas/user.schema';
import {
  Assignment,
  AssignmentDocument,
} from '../assignment/schemas/assignment.schema';
import { Quiz, QuizDocument } from '../quiz/schemas/quiz.schema';
import { AnnouncementGateway } from './announcement.gateway';

@Injectable()
export class AnnouncementService {
  constructor(
    @InjectModel(Announcement.name)
    private readonly announcementModel: Model<AnnouncementDocument>,

    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,

    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,

    @InjectModel(Assignment.name)
    private readonly assignmentModel: Model<AssignmentDocument>,

    @InjectModel(Quiz.name)
    private readonly quizModel: Model<QuizDocument>,

    @InjectConnection() private readonly connection: Connection,

    private readonly gateway: AnnouncementGateway,
  ) {}

  // ─── Create Announcement ──────────────────────────────────────────────────
  async create(dto: CreateAnnouncementDto, instructorId: string) {
    const course = await this.courseModel.findById(dto.courseId);
    if (!course) throw new NotFoundException('Course not found');

    let batchName = 'All Batches';
    if (dto.batchId) {
      const batchExists = (
        course.batch as { _id?: Types.ObjectId; batchName: string }[]
      ).find((b) => b._id?.toString() === dto.batchId);
      if (!batchExists) {
        throw new BadRequestException('Batch not found in this course');
      }
      batchName = batchExists.batchName;
    }

    const instructor = await this.userModel.findById(instructorId);
    if (!instructor) throw new NotFoundException('Instructor not found');

    if (instructor.role === 'teacher' && instructor.teacherId) {
      const isHead = String(course.head_teacher) === String(instructor.teacherId);
      const isInstructor = String(course.instructor_id) === String(instructor.teacherId);
      const teachesBatch = dto.batchId
        ? (course.batch as { _id?: Types.ObjectId; teacher?: string | null }[])?.some(
            (b) =>
              b._id?.toString() === dto.batchId &&
              String(b.teacher) === String(instructor.teacherId),
          )
        : false;

      if (!isHead && !isInstructor && !teachesBatch) {
        throw new ForbiddenException(
          'You are not authorized to post announcements for this course or batch',
        );
      }
    }

    let status = dto.status || 'published';
    let scheduledAt: Date | null = null;
    let publishedAt: Date | null = null;

    if (dto.scheduledAt) {
      // User can schedule future date only
      scheduledAt = new Date(dto.scheduledAt);
      scheduledAt.setUTCHours(0, 0, 0, 0); // Start of scheduled day in UTC

      const startOfToday = new Date();
      startOfToday.setUTCHours(0, 0, 0, 0);

      if (scheduledAt.getTime() > startOfToday.getTime()) {
        status = 'draft'; // Future date means it must be a draft first
      } else {
        // Scheduled date is today or in the past, publish immediately
        status = 'published';
        publishedAt = new Date();
      }
    } else if (status === 'published') {
      publishedAt = new Date();
    }

    const announcement = await this.announcementModel.create({
      title: dto.title,
      message: dto.message,
      courseId: new Types.ObjectId(dto.courseId),
      batchId: dto.batchId || null,
      instructorId: new Types.ObjectId(instructorId),
      status,
      scheduledAt,
      publishedAt,
      readBy: [new Types.ObjectId(instructorId)],
      type: 'general',
      referenceId: null,
    });

    const formatted = await this.formatAnnouncement(announcement);

    if (status === 'published') {
      this.gateway.broadcastNewAnnouncement(formatted);
    }

    return {
      status: true,
      message:
        status === 'published'
          ? 'Announcement posted successfully'
          : 'Announcement saved as draft',
      data: formatted,
    };
  }

  // ─── Find for Course (Instructor and Students list) ──────────────────────
  async findByCourse(
    courseId: string,
    tab: 'announcement' | 'draft' = 'announcement',
    page = 1,
    limit = 10,
    search?: string,
    batchId?: string,
  ) {
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = {
      courseId: new Types.ObjectId(courseId),
    };

    // Apply tab filter (Instructor views drafts vs published, Student only gets published)
    if (tab === 'draft') {
      filter.status = 'draft';
    } else {
      filter.status = 'published';
    }

    // If targeted batchId is requested (e.g. for student view)
    if (batchId) {
      filter.$or = [{ batchId: null }, { batchId: '' }, { batchId }];
    }

    if (search) {
      const regex = new RegExp(search, 'i');
      filter.$or = [{ title: regex }, { message: regex }];
    }

    const [announcements, total] = await Promise.all([
      this.announcementModel
        .find(filter)
        .sort({ publishedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      this.announcementModel.countDocuments(filter),
    ]);

    const enriched = await Promise.all(
      announcements.map((ann) => this.formatAnnouncement(ann)),
    );

    return {
      status: true,
      data: {
        announcements: enriched,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── Find for Multiple Courses ─────────────────────────────────────────────
  async findByCourses(courses: { courseId: string; batchId?: string }[]) {
    if (!courses || courses.length === 0) {
      return { status: true, data: { announcements: [] } };
    }

    const orConditions = courses.map(c => {
      const cond: Record<string, any> = { courseId: new Types.ObjectId(c.courseId) };
      if (c.batchId) {
        cond.$or = [{ batchId: null }, { batchId: '' }, { batchId: c.batchId }];
      }
      return cond;
    });

    const filter = {
      status: 'published',
      $or: orConditions
    };

    const announcements = await this.announcementModel
      .find(filter as any)
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(30);

    const enriched = await Promise.all(
      announcements.map((ann) => this.formatAnnouncement(ann)),
    );

    return {
      status: true,
      data: { announcements: enriched }
    };
  }

  // ─── Find for all Instructor Courses (Aggregated list) ────────────────────
  async findByInstructor(
    instructorId: string,
    tab: 'announcement' | 'draft' = 'announcement',
    page = 1,
    limit = 10,
    search?: string,
  ) {
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = {
      instructorId: new Types.ObjectId(instructorId),
    };

    if (tab === 'draft') {
      filter.status = 'draft';
    } else {
      filter.status = 'published';
    }

    if (search) {
      const regex = new RegExp(search, 'i');
      filter.title = regex;
    }

    const [announcements, total] = await Promise.all([
      this.announcementModel
        .find(filter)
        .sort({ publishedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      this.announcementModel.countDocuments(filter),
    ]);

    const enriched = await Promise.all(
      announcements.map((ann) => this.formatAnnouncement(ann)),
    );

    return {
      status: true,
      data: {
        announcements: enriched,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── Update Draft ─────────────────────────────────────────────────────────
  async update(id: string, dto: UpdateAnnouncementDto, instructorId: string) {
    const announcement = await this.announcementModel.findById(id);
    if (!announcement) throw new NotFoundException('Announcement not found');

    if (announcement.instructorId.toString() !== instructorId) {
      throw new ForbiddenException(
        'Not authorized to update this announcement',
      );
    }

    if (announcement.status !== 'draft') {
      throw new BadRequestException('Only drafts can be updated');
    }

    let status = dto.status || announcement.status;
    let scheduledAt: Date | null = announcement.scheduledAt;
    let publishedAt: Date | null = announcement.publishedAt;

    if (dto.scheduledAt) {
      scheduledAt = new Date(dto.scheduledAt);
      scheduledAt.setUTCHours(0, 0, 0, 0);

      const startOfToday = new Date();
      startOfToday.setUTCHours(0, 0, 0, 0);

      if (scheduledAt.getTime() > startOfToday.getTime()) {
        status = 'draft';
      } else {
        status = 'published';
        publishedAt = new Date();
      }
    } else if (status === 'published') {
      publishedAt = new Date();
      scheduledAt = null;
    }

    const updated = await this.announcementModel.findByIdAndUpdate(
      id,
      {
        ...(dto.title && { title: dto.title }),
        ...(dto.message && { message: dto.message }),
        status,
        scheduledAt,
        publishedAt,
      },
      { new: true },
    );

    if (!updated) throw new NotFoundException('Announcement not found');

    const formatted = await this.formatAnnouncement(updated);

    if (status === 'published') {
      this.gateway.broadcastNewAnnouncement(formatted);
    }

    return {
      status: true,
      message:
        status === 'published'
          ? 'Announcement published successfully'
          : 'Draft updated successfully',
      data: formatted,
    };
  }

  // ─── Delete Announcement ──────────────────────────────────────────────────
  async delete(id: string, instructorId: string) {
    const announcement = await this.announcementModel.findById(id);
    if (!announcement) throw new NotFoundException('Announcement not found');

    if (announcement.instructorId.toString() !== instructorId) {
      throw new ForbiddenException(
        'Not authorized to delete this announcement',
      );
    }

    await this.announcementModel.findByIdAndDelete(id);

    // Broadcast deletion in real-time
    this.gateway.broadcastDeletedAnnouncement(
      String(announcement._id),
      String(announcement.courseId),
      announcement.batchId || undefined,
    );

    return {
      status: true,
      message: 'Announcement deleted successfully',
    };
  }

  // ─── Midnight Scheduler ───────────────────────────────────────────────────
  async publishScheduledAnnouncements() {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    // Find all drafts where scheduledAt is today or in the past
    const scheduled = await this.announcementModel.find({
      status: 'draft',
      scheduledAt: { $ne: null, $lte: startOfToday },
    });

    let count = 0;
    for (const ann of scheduled) {
      ann.status = 'published';
      ann.publishedAt = new Date();
      await ann.save();

      const formatted = await this.formatAnnouncement(ann);
      this.gateway.broadcastNewAnnouncement(formatted);
      count++;
    }

    return {
      status: true,
      publishedCount: count,
    };
  }

  // ─── Resolve Accessible Filters Based on Role ─────────────────────────────
  private async resolveAccessibleFilters(userId: string, role: string) {
    const dbUser = await this.userModel.findById(userId).lean();
    if (!dbUser) return { _id: null };

    if (role === 'instructor') {
      const courseFilter: Record<string, unknown> = {
        $or: [
          { created_by: dbUser._id },
          ...(dbUser.organisationId
            ? [{ organisation_id: dbUser.organisationId }]
            : []),
        ],
      };
      const courses = await this.courseModel
        .find(courseFilter)
        .select('_id')
        .lean();
      const courseIds = courses.map((c) => c._id);
      return {
        $or: [
          { instructorId: new Types.ObjectId(userId) },
          { courseId: { $in: courseIds } },
        ],
      };
    }

    if (role === 'teacher' && dbUser.teacherId) {
      const courses = await this.courseModel
        .find({
          organisation_id: dbUser.organisationId,
          $or: [
            { head_teacher: dbUser.teacherId },
            { instructor_id: dbUser.teacherId },
            { 'batch.teacher': String(dbUser.teacherId) },
          ],
        })
        .select('batch head_teacher instructor_id')
        .lean();

      const orConditions: Record<string, unknown>[] = [
        { instructorId: new Types.ObjectId(userId) },
      ];

      courses.forEach((c) => {
        const isHeadOrInstructor =
          String(c.head_teacher) === String(dbUser.teacherId) ||
          String(c.instructor_id) === String(dbUser.teacherId);

        if (isHeadOrInstructor) {
          orConditions.push({ courseId: c._id });
        } else {
          const assignedBatchIds: string[] = [];
          (c.batch || []).forEach(
            (b: { _id?: Types.ObjectId; teacher?: string | null }) => {
              if (b._id && String(b.teacher) === String(dbUser.teacherId)) {
                assignedBatchIds.push(String(b._id));
              }
            },
          );
          orConditions.push({
            courseId: c._id,
            batchId: { $in: [null, '', ...assignedBatchIds] },
          });
        }
      });

      return orConditions.length > 0 ? { $or: orConditions } : { _id: null };
    }

    // Student: find courses and batches from batch_enrolled_students
    const enrollments = await this.connection
      .collection('batch_enrolled_students')
      .find({ student_id: new Types.ObjectId(userId) })
      .toArray();

    if (enrollments.length === 0) {
      return { _id: null };
    }

    const orConditions: Record<string, unknown>[] = [];
    enrollments.forEach((e) => {
      if (e.course_id) {
        // Only receive announcements created on or after the student's enrollment date/time
        const enrolledAt = e.createdAt || e.enrolled_at || new Date(0);
        const batchFilter = e.batch_id
          ? { $in: [null, '', String(e.batch_id), new Types.ObjectId(e.batch_id)] }
          : { $in: [null, ''] };

        orConditions.push({
          courseId: new Types.ObjectId(e.course_id),
          batchId: batchFilter,
          createdAt: { $gte: new Date(enrolledAt) },
        });
      }
    });

    return orConditions.length > 0 ? { $or: orConditions } : { _id: null };
  }

  // ─── Get My Announcements (Personalized per Role) ──────────────────────────
  async getMyAnnouncements(
    userId: string,
    role: string,
    tab: 'announcement' | 'draft' = 'announcement',
    page = 1,
    limit = 10,
    search?: string,
    excludeSelf = false,
  ) {
    const skip = (page - 1) * limit;

    let filter: Record<string, unknown> = {};

    if (tab === 'draft') {
      filter = {
        instructorId: new Types.ObjectId(userId),
        status: 'draft',
      };
    } else {
      const accessFilter = await this.resolveAccessibleFilters(userId, role);
      filter = {
        status: 'published',
        ...accessFilter,
      };

      if (excludeSelf) {
        filter.instructorId = { $ne: new Types.ObjectId(userId) };
      }
    }

    if (search) {
      const regex = new RegExp(search, 'i');
      filter.$and = [
        ...(filter.$and ? (filter.$and as unknown[]) : []),
        { $or: [{ title: regex }, { message: regex }] },
      ];
    }

    const [announcements, total] = await Promise.all([
      this.announcementModel
        .find(filter)
        .sort({ publishedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      this.announcementModel.countDocuments(filter),
    ]);

    const enriched = await Promise.all(
      announcements.map((ann) => this.formatAnnouncement(ann)),
    );

    return {
      status: true,
      data: {
        announcements: enriched,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── Get Unread Count ─────────────────────────────────────────────────────
  async getUnreadCount(userId: string, role: string) {
    const accessFilter = await this.resolveAccessibleFilters(userId, role);
    const filter: Record<string, unknown> = {
      status: 'published',
      instructorId: { $ne: new Types.ObjectId(userId) }, // Never count user's own created announcements
      readBy: { $ne: new Types.ObjectId(userId) },
      ...accessFilter,
    };

    const count = await this.announcementModel.countDocuments(filter);
    return {
      status: true,
      data: {
        unreadCount: count,
      },
    };
  }

  // ─── Mark All Announcements As Read ───────────────────────────────────────
  async markAllAsRead(userId: string, role: string) {
    const accessFilter = await this.resolveAccessibleFilters(userId, role);
    const filter: Record<string, unknown> = {
      status: 'published',
      instructorId: { $ne: new Types.ObjectId(userId) },
      readBy: { $ne: new Types.ObjectId(userId) },
      ...accessFilter,
    };

    await this.announcementModel.updateMany(filter, {
      $addToSet: { readBy: new Types.ObjectId(userId) },
    });

    return {
      status: true,
      message: 'All announcements marked as read',
    };
  }

  // ─── Check and Create Automated Due Date Announcements ────────────────────
  async checkAndCreateDueDateAnnouncements() {
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    let createdCount = 0;

    // 1. Check published assignments due within the next 24 hours
    const upcomingAssignments = await this.assignmentModel
      .find({
        status: 'published',
        dueDate: { $gt: now, $lte: in24Hours },
      })
      .lean();

    for (const assignment of upcomingAssignments) {
      const existing = await this.announcementModel.findOne({
        referenceId: String(assignment._id),
        type: 'assignment_due',
      });

      if (!existing) {
        const course = await this.courseModel
          .findById(assignment.courseId)
          .select('course_name created_by')
          .lean();

        const formattedDate = new Date(assignment.dueDate).toLocaleString(
          'en-US',
          {
            dateStyle: 'medium',
            timeStyle: 'short',
          },
        );

        const instructorId =
          assignment.created_by || course?.created_by || assignment.courseId;

        const announcement = await this.announcementModel.create({
          title: `Reminder: Assignment "${assignment.assignmentName}" Due Soon`,
          message: `<p>The assignment <strong>${assignment.assignmentName}</strong> is due on <strong>${formattedDate}</strong>. Please ensure you submit your work before the deadline.</p>`,
          courseId: assignment.courseId,
          batchId: assignment.batchId || null,
          instructorId: new Types.ObjectId(String(instructorId)),
          status: 'published',
          publishedAt: new Date(),
          type: 'assignment_due',
          referenceId: String(assignment._id),
          readBy: [],
        });

        const formatted = await this.formatAnnouncement(announcement);
        this.gateway.broadcastNewAnnouncement(formatted);
        createdCount++;
      }
    }

    // 2. Check published quizzes due within the next 24 hours
    const upcomingQuizzes = await this.quizModel
      .find({
        status: 'published',
        dueDate: { $gt: now, $lte: in24Hours },
      })
      .lean();

    for (const quiz of upcomingQuizzes) {
      const existing = await this.announcementModel.findOne({
        referenceId: String(quiz._id),
        type: 'quiz_due',
      });

      if (!existing) {
        const course = await this.courseModel
          .findById(quiz.courseId)
          .select('course_name created_by')
          .lean();

        const formattedDate = new Date(quiz.dueDate).toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short',
        });

        const instructorId =
          quiz.created_by || course?.created_by || quiz.courseId;

        const announcement = await this.announcementModel.create({
          title: `Reminder: Quiz "${quiz.quizName}" Due Soon`,
          message: `<p>The quiz <strong>${quiz.quizName}</strong> is due on <strong>${formattedDate}</strong>. Please make sure to complete it before the deadline.</p>`,
          courseId: quiz.courseId,
          batchId: quiz.batchId || null,
          instructorId: new Types.ObjectId(String(instructorId)),
          status: 'published',
          publishedAt: new Date(),
          type: 'quiz_due',
          referenceId: String(quiz._id),
          readBy: [],
        });

        const formatted = await this.formatAnnouncement(announcement);
        this.gateway.broadcastNewAnnouncement(formatted);
        createdCount++;
      }
    }

    return {
      status: true,
      message: `Due date check complete. Created ${createdCount} auto-announcements.`,
      count: createdCount,
    };
  }

  // ─── Helper Formatter ─────────────────────────────────────────────────────
  public async formatAnnouncement(ann: AnnouncementDocument) {
    const course = await this.courseModel
      .findById(ann.courseId)
      .select('course_name batch');

    const batch = course
      ? (course.batch as { _id?: Types.ObjectId; batchName: string }[]).find(
          (b) => b._id?.toString() === ann.batchId,
        )
      : null;

    const instructor = await this.userModel
      .findById(ann.instructorId)
      .select('firstName lastName profileImg email');

    return {
      _id: String(ann._id),
      title: ann.title,
      message: ann.message,
      courseId: String(ann.courseId),
      courseName: course?.course_name || 'Unknown Course',
      batchId: ann.batchId ? String(ann.batchId) : null,
      batchName: batch?.batchName || 'All Batches',
      instructorId: String(ann.instructorId),
      instructorName: instructor
        ? `${instructor.firstName} ${instructor.lastName}`
        : 'Unknown Instructor',
      instructorAvatar:
        (instructor as unknown as { profileImg?: string })?.profileImg || null,
      status: ann.status,
      type: (ann as unknown as { type?: string })?.type || 'general',
      referenceId:
        (ann as unknown as { referenceId?: string | null })?.referenceId || null,
      readBy: (
        (ann as unknown as { readBy?: Types.ObjectId[] })?.readBy || []
      ).map((id) => String(id)),
      scheduledAt: ann.scheduledAt
        ? ann.scheduledAt.toISOString().split('T')[0]
        : null,
      publishedAt: ann.publishedAt ? ann.publishedAt.toISOString() : null,
      createdAt: ann.get('createdAt') as Date,
    };
  }
}
