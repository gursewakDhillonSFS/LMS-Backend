import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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

  // ─── Helper Formatter ─────────────────────────────────────────────────────
  private async formatAnnouncement(ann: AnnouncementDocument) {
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
      scheduledAt: ann.scheduledAt
        ? ann.scheduledAt.toISOString().split('T')[0]
        : null,
      publishedAt: ann.publishedAt ? ann.publishedAt.toISOString() : null,
      createdAt: ann.get('createdAt') as Date,
    };
  }
}
