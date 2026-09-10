import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AnnouncementService } from './announcement.service';
import {
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
} from './dto/announcement.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InstructorOnlyGuard } from '../auth/instructor-only.guard';
import type { AuthenticatedRequest } from '../common/interfaces/auth-request.interface';

@UseGuards(JwtAuthGuard)
@Controller('auth/announcement/v1')
export class AnnouncementController {
  constructor(private readonly announcementService: AnnouncementService) {}

  // POST /auth/announcement/v1/create
  @Post('create')
  create(@Body() dto: CreateAnnouncementDto, @Req() req: AuthenticatedRequest) {
    const instructorId = req.user.userId;
    return this.announcementService.create(dto, instructorId);
  }

  // GET /auth/announcement/v1/by-course/:courseId?tab=announcement&page=1&limit=10&search=&batchId=
  @Get('by-course/:courseId')
  findByCourse(
    @Param('courseId') courseId: string,
    @Query('tab') tab: 'announcement' | 'draft' = 'announcement',
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('search') search?: string,
    @Query('batchId') batchId?: string,
  ) {
    return this.announcementService.findByCourse(
      courseId,
      tab,
      Number(page),
      Number(limit),
      search,
      batchId,
    );
  }

  // POST /auth/announcement/v1/by-courses
  @Post('by-courses')
  findByCourses(@Body() dto: { courses: { courseId: string; batchId?: string }[] }) {
    return this.announcementService.findByCourses(dto.courses || []);
  }

  // GET /auth/announcement/v1/by-instructor?tab=announcement&page=1&limit=10&search=
  @Get('by-instructor')
  findByInstructor(
    @Req() req: AuthenticatedRequest,
    @Query('tab') tab: 'announcement' | 'draft' = 'announcement',
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('search') search?: string,
  ) {
    const instructorId = req.user.userId;
    return this.announcementService.findByInstructor(
      instructorId,
      tab,
      Number(page),
      Number(limit),
      search,
    );
  }

  // PUT /auth/announcement/v1/update/:id
  @Put('update/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAnnouncementDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const instructorId = req.user.userId;
    return this.announcementService.update(id, dto, instructorId);
  }

  // DELETE /auth/announcement/v1/delete/:id
  @Delete('delete/:id')
  delete(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const instructorId = req.user.userId;
    return this.announcementService.delete(id, instructorId);
  }

  // GET /auth/announcement/v1/my-announcements?tab=announcement&page=1&limit=10&search=&excludeSelf=true
  @Get('my-announcements')
  getMyAnnouncements(
    @Req() req: AuthenticatedRequest,
    @Query('tab') tab: 'announcement' | 'draft' = 'announcement',
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('search') search?: string,
    @Query('excludeSelf') excludeSelf?: string,
  ) {
    return this.announcementService.getMyAnnouncements(
      req.user.userId,
      req.user.role,
      tab,
      Number(page),
      Number(limit),
      search,
      excludeSelf === 'true' || excludeSelf === '1',
    );
  }

  // GET /auth/announcement/v1/unread-count
  @Get('unread-count')
  getUnreadCount(@Req() req: AuthenticatedRequest) {
    return this.announcementService.getUnreadCount(
      req.user.userId,
      req.user.role,
    );
  }

  // POST /auth/announcement/v1/mark-all-read
  @Post('mark-all-read')
  markAllRead(@Req() req: AuthenticatedRequest) {
    return this.announcementService.markAllAsRead(
      req.user.userId,
      req.user.role,
    );
  }

  // POST /auth/announcement/v1/trigger-due-date-check
  @Post('trigger-due-date-check')
  triggerDueDateCheck() {
    return this.announcementService.checkAndCreateDueDateAnnouncements();
  }

  // POST /auth/announcement/v1/trigger-scheduler (instructor only)
  @UseGuards(InstructorOnlyGuard)
  @Post('trigger-scheduler')
  triggerScheduler() {
    return this.announcementService.publishScheduledAnnouncements();
  }
}
