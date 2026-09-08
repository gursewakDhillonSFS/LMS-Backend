import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminOnlyGuard } from '../auth/admin-only.guard';
import { User, UserDocument, UserRole } from '../user/schemas/user.schema';
import { Course, CourseDocument } from '../course/schemas/course.schema';
import { AnnouncementService } from '../announcement/announcement.service';

@UseGuards(JwtAuthGuard, AdminOnlyGuard)
@Controller('admin/v1')
export class AdminController {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
    private readonly announcementService: AnnouncementService,
  ) {}

  @Get('overview')
  async overview() {
    const [users, instructors, teachers, students, courses, published] =
      await Promise.all([
        this.userModel.countDocuments(),
        this.userModel.countDocuments({ role: UserRole.INSTRUCTOR }),
        this.userModel.countDocuments({ role: UserRole.TEACHER }),
        this.userModel.countDocuments({ role: UserRole.STUDENT }),
        this.courseModel.countDocuments(),
        this.courseModel.countDocuments({ course_status: 'published' }),
      ]);
    return {
      status: true,
      data: {
        users,
        instructors,
        teachers,
        students,
        courses,
        publishedCourses: published,
      },
    };
  }

  @Get('users')
  async listUsers(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('role') role?: string,
  ) {
    const p = Number(page);
    const l = Number(limit);
    const filter: Record<string, unknown> = {};
    if (role) filter.role = role;
    const [rows, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select('-password -resetOtp -resetOtpExpiry')
        .skip((p - 1) * l)
        .limit(l)
        .sort({ createdAt: -1 })
        .lean(),
      this.userModel.countDocuments(filter),
    ]);
    return {
      status: true,
      data: { users: rows, total, page: p, totalPages: Math.ceil(total / l) },
    };
  }

  @Get('courses')
  async listCourses(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const p = Number(page);
    const l = Number(limit);
    const [rows, total] = await Promise.all([
      this.courseModel
        .find()
        .select('course_name course_status course_type course_price enrolled_user_count created_by')
        .skip((p - 1) * l)
        .limit(l)
        .sort({ createdAt: -1 })
        .lean(),
      this.courseModel.countDocuments(),
    ]);
    return {
      status: true,
      data: { courses: rows, total, page: p, totalPages: Math.ceil(total / l) },
    };
  }

  @Get('trigger-announcement-scheduler')
  triggerAnnouncements() {
    return this.announcementService.publishScheduledAnnouncements();
  }
}
