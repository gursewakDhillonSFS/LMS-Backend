import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Schedule, ScheduleDocument } from './schemas/schedule.schema';
import { User, UserDocument } from '../user/schemas/user.schema';
import {
  Announcement,
  AnnouncementDocument,
} from '../announcement/schemas/announcement.schema';
import { CreateScheduleDto, UpdateScheduleDto } from './dto/schedule.dto';

@Injectable()
export class ScheduleService {
  constructor(
    @InjectModel(Schedule.name) private scheduleModel: Model<ScheduleDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Announcement.name)
    private announcementModel: Model<AnnouncementDocument>,
  ) {}

  private async checkTeacherScheduleAccess(
    user: UserDocument,
    courseId?: string,
    batchId?: string,
  ) {
    if (user.role === 'teacher') {
      if (!user.teacherId) {
        throw new ForbiddenException('Teacher profile not linked');
      }

      const CourseModel = this.scheduleModel.db.model('Course');

      if (courseId || batchId) {
        const query: Record<string, unknown> = {
          organisation_id: user.organisationId,
        };
        if (courseId) {
          query._id = new Types.ObjectId(courseId);
        }
        if (batchId) {
          query['batch._id'] = new Types.ObjectId(batchId);
        }

        const course = (await CourseModel.findOne(query).lean()) as {
          _id: Types.ObjectId;
          head_teacher?: Types.ObjectId;
          instructor_id?: Types.ObjectId;
          batch?: {
            _id?: Types.ObjectId;
            batchName: string;
            teacher: string | null;
          }[];
        } | null;
        if (!course) {
          throw new ForbiddenException(
            'Course or batch not found in your organisation',
          );
        }

        const isHead =
          (course.head_teacher &&
            String(course.head_teacher) === String(user.teacherId)) ||
          (course.instructor_id &&
            String(course.instructor_id) === String(user.teacherId));

        if (batchId) {
          const batch = (course.batch || []).find((b) =>
            b._id ? String(b._id) === batchId : false,
          );
          const isBatchTeacher =
            batch &&
            batch.teacher &&
            String(batch.teacher) === String(user.teacherId);
          if (!isHead && !isBatchTeacher) {
            throw new ForbiddenException(
              'You are not authorized to manage schedules for this batch',
            );
          }
        } else {
          const hasBatchAccess = (course.batch || []).some(
            (b) => b.teacher && String(b.teacher) === String(user.teacherId),
          );
          if (!isHead && !hasBatchAccess) {
            throw new ForbiddenException(
              'You are not authorized to manage schedules for this course',
            );
          }
        }
      }
    }
  }

  async create(userId: string, dto: CreateScheduleDto) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (!user.organisationId) {
      throw new BadRequestException(
        'User is not associated with an organisation',
      );
    }

    // Teacher check
    await this.checkTeacherScheduleAccess(user, dto.courseId, dto.batchId);

    const scheduleDate = new Date(dto.date);
    if (isNaN(scheduleDate.getTime())) {
      throw new BadRequestException('Invalid date provided');
    }

    const schedule = new this.scheduleModel({
      title: dto.title,
      description: dto.description || '',
      date: scheduleDate,
      startTime: dto.startTime,
      endTime: dto.endTime,
      courseId: dto.courseId ? new Types.ObjectId(dto.courseId) : null,
      batchId: dto.batchId || null,
      meetingLink: dto.meetingLink || '',
      createdBy: new Types.ObjectId(userId),
      organisationId: user.organisationId,
    });

    const saved = await schedule.save();

    // If associated with a course, automatically broadcast an announcement to enrolled students
    if (saved.courseId) {
      try {
        const formattedDate = scheduleDate.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        await this.announcementModel.create({
          title: `Live Session Scheduled: ${dto.title}`,
          message: `A new live interactive class "${dto.title}" has been scheduled for ${formattedDate} from ${dto.startTime} to ${dto.endTime}. The join link will be active at session time!`,
          courseId: saved.courseId,
          batchId: saved.batchId || null,
          instructorId: new Types.ObjectId(userId),
          status: 'published',
          publishedAt: new Date(),
          type: 'general',
          referenceId: String(saved._id),
        });
      } catch (annErr) {
        // Non-blocking log
        console.error('Failed to create announcement for live class:', annErr);
      }
    }

    return {
      success: true,
      message: 'Schedule created successfully',
      data: saved,
    };
  }

  async findAll(
    userId: string,
    month?: number,
    year?: number,
    courseId?: string,
    batchId?: string,
  ) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (!user.organisationId) {
      throw new BadRequestException(
        'User is not associated with an organisation',
      );
    }

    const query: Record<string, unknown> = {
      organisationId: user.organisationId,
    };

    const CourseModel = this.scheduleModel.db.model('Course');

    if (user.role === 'teacher') {
      if (!user.teacherId) {
        return { success: true, data: [] };
      }

      const courses = (await CourseModel.find({
        organisation_id: user.organisationId,
        $or: [
          { head_teacher: new Types.ObjectId(String(user.teacherId)) },
          { instructor_id: new Types.ObjectId(String(user.teacherId)) },
          { 'batch.teacher': String(user.teacherId) },
        ],
      }).lean()) as {
        _id: Types.ObjectId;
        head_teacher?: Types.ObjectId;
        instructor_id?: Types.ObjectId;
        batch?: {
          _id?: Types.ObjectId;
          batchName: string;
          teacher: string | null;
        }[];
      }[];

      const allowedBatchIds: string[] = [];
      const allowedCourseIds: Types.ObjectId[] = [];
      courses.forEach((c) => {
        allowedCourseIds.push(c._id);
        const isHead =
          (c.head_teacher &&
            String(c.head_teacher) === String(user.teacherId)) ||
          (c.instructor_id &&
            String(c.instructor_id) === String(user.teacherId));

        (c.batch || []).forEach((b) => {
          if (
            isHead ||
            (b.teacher && String(b.teacher) === String(user.teacherId))
          ) {
            allowedBatchIds.push(String(b._id || ''));
          }
        });
      });

      if (batchId) {
        if (!allowedBatchIds.includes(batchId)) {
          throw new ForbiddenException('You do not have access to this batch');
        }
        query.batchId = batchId;
      } else if (courseId) {
        if (!allowedCourseIds.some((id) => String(id) === courseId)) {
          throw new ForbiddenException('You do not have access to this course');
        }
        query.courseId = new Types.ObjectId(courseId);
        const course = courses.find((c) => String(c._id) === courseId);
        const isHead =
          course &&
          ((course.head_teacher &&
            String(course.head_teacher) === String(user.teacherId)) ||
            (course.instructor_id &&
              String(course.instructor_id) === String(user.teacherId)));

        const courseBatchIds = course
          ? (course.batch || [])
              .filter(
                (b) =>
                  isHead ||
                  (b.teacher && String(b.teacher) === String(user.teacherId)),
              )
              .map((b) => String(b._id || ''))
          : [];

        query.$or = [
          { batchId: { $in: courseBatchIds } },
          { courseId: new Types.ObjectId(courseId), batchId: null },
        ];
      } else {
        query.$or = [
          { createdBy: user._id },
          { courseId: { $in: allowedCourseIds }, batchId: null },
          { batchId: { $in: allowedBatchIds } },
        ];
      }
    } else if (user.role === 'student') {
      const studentBatchIds = user.batchIds ? user.batchIds.map(String) : [];
      if (batchId) {
        if (!studentBatchIds.includes(batchId)) {
          throw new ForbiddenException('You do not have access to this batch');
        }
        query.batchId = batchId;
      } else {
        query.batchId = { $in: studentBatchIds };
      }
    } else {
      if (courseId) {
        query.courseId = new Types.ObjectId(courseId);
      }
      if (batchId) {
        query.batchId = batchId;
      }
    }

    if (month && year) {
      const startDate = new Date(Date.UTC(year, month - 1, 1));
      const endDate = new Date(Date.UTC(year, month, 1));
      query.date = { $gte: startDate, $lt: endDate };
    }

    const schedules = await this.scheduleModel
      .find(query)
      .populate('createdBy', 'firstName lastName email profileImg')
      .populate('courseId', 'course_name')
      .sort({ date: 1, startTime: 1 });

    return { success: true, data: schedules };
  }

  async update(userId: string, id: string, dto: UpdateScheduleDto) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const schedule = await this.scheduleModel.findById(id);
    if (!schedule) throw new NotFoundException('Schedule event not found');

    if (
      schedule.organisationId.toString() !== user.organisationId?.toString()
    ) {
      throw new ForbiddenException(
        'You do not have permission to update this schedule',
      );
    }

    // Teacher check
    await this.checkTeacherScheduleAccess(user, dto.courseId, dto.batchId);

    const scheduleDate = new Date(dto.date);
    if (isNaN(scheduleDate.getTime())) {
      throw new BadRequestException('Invalid date provided');
    }

    schedule.title = dto.title;
    schedule.description = dto.description || '';
    schedule.date = scheduleDate;
    schedule.startTime = dto.startTime;
    schedule.endTime = dto.endTime;
    schedule.courseId = dto.courseId ? new Types.ObjectId(dto.courseId) : null;
    schedule.batchId = dto.batchId || null;
    schedule.meetingLink = dto.meetingLink || '';

    const saved = await schedule.save();
    return {
      success: true,
      message: 'Schedule updated successfully',
      data: saved,
    };
  }

  async delete(userId: string, id: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const schedule = await this.scheduleModel.findById(id);
    if (!schedule) throw new NotFoundException('Schedule event not found');

    if (
      schedule.organisationId.toString() !== user.organisationId?.toString()
    ) {
      throw new ForbiddenException(
        'You do not have permission to delete this schedule',
      );
    }

    if (user.role === 'teacher') {
      if (schedule.createdBy.toString() !== userId) {
        await this.checkTeacherScheduleAccess(
          user,
          schedule.courseId?.toString(),
          schedule.batchId || undefined,
        );
      }
    }

    await this.scheduleModel.findByIdAndDelete(id);
    return { success: true, message: 'Schedule deleted successfully' };
  }

  async updateRecording(
    userId: string,
    id: string,
    recordingUrl: string,
    recordingName?: string,
  ) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const schedule = await this.scheduleModel.findById(id);
    if (!schedule) throw new NotFoundException('Schedule event not found');

    if (
      schedule.organisationId.toString() !== user.organisationId?.toString()
    ) {
      throw new ForbiddenException(
        'You do not have permission to modify this schedule',
      );
    }

    if (user.role === 'teacher') {
      if (schedule.createdBy.toString() !== userId) {
        await this.checkTeacherScheduleAccess(
          user,
          schedule.courseId?.toString(),
          schedule.batchId || undefined,
        );
      }
    }

    schedule.recordingUrl = recordingUrl || '';
    if (recordingName) {
      schedule.recordingName = recordingName;
    }
    await schedule.save();

    return {
      success: true,
      message: 'Meeting recording updated successfully',
      data: schedule,
    };
  }
}

