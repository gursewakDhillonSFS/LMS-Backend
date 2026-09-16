import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  Patch,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { InstructorOnlyGuard } from '../auth/instructor-only.guard';
import { CourseService } from './course.service';
import type { AuthenticatedRequest } from '../common/interfaces/auth-request.interface';
import {
  CreateFinalStepDto,
  CreateStep1Dto,
  CreateStep3Dto,
  UpdateCourseStatusDto,
  UpdateStep2Dto,
  UpdateStep3Dto,
  UpdateStep4Dto,
  UpdateStep5Dto,
  UpdateStep6Dto,
} from './dto/course.dto';

const multerMemory = { storage: memoryStorage() };

@Controller('auth/course/v1')
export class CourseController {
  constructor(private readonly courseService: CourseService) {}

  private extractLocale(req: any, query?: Record<string, any>): string {
    if (query?.language && ['en', 'pa', 'fr'].includes(query.language)) {
      return query.language;
    }
    if (query?.lang && ['en', 'pa', 'fr'].includes(query.lang)) {
      return query.lang;
    }
    const acceptLang = req?.headers?.['accept-language'];
    if (acceptLang) {
      const primary = acceptLang.split(',')[0].trim().toLowerCase().substring(0, 2);
      if (['pa', 'fr', 'en'].includes(primary)) {
        return primary;
      }
    }
    if (
      req?.user?.preferred_language &&
      ['en', 'pa', 'fr'].includes(req.user.preferred_language)
    ) {
      return req.user.preferred_language;
    }
    return 'en';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CREATE STEPS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * POST /auth/course/v1/create/course-step-1
   * Upsert-safe: if course_id is in body, updates existing course (back-button safe)
   */
  @UseGuards(JwtAuthGuard, InstructorOnlyGuard)
  @Post('create/course-step-1')
  async createStep1(
    @Body() dto: CreateStep1Dto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.courseService.createStep1(dto, req.user.userId);
  }

  /**
   * POST /auth/course/v1/create/course-step-2
   * FormData: payload (JSON) + course_image (file, optional)
   */
  @UseGuards(JwtAuthGuard, InstructorOnlyGuard)
  @Post('create/course-step-2')
  @UseInterceptors(FileInterceptor('course_image', multerMemory))
  async createStep2(
    @UploadedFile() file: Express.Multer.File,
    @Body('payload') rawPayload: string,
  ) {
    const dto = JSON.parse(rawPayload);
    return this.courseService.createStep2(dto, file);
  }

  /**
   * POST /auth/course/v1/create/course-step-3
   * JSON: { course_id, about_course, instructor_id, description }
   */
  @UseGuards(JwtAuthGuard, InstructorOnlyGuard)
  @Post('create/course-step-3')
  async createStep3(@Body() dto: CreateStep3Dto) {
    return this.courseService.createStep3(dto);
  }

  /**
   * POST /auth/course/v1/create/course-final-step
   * JSON: { course_id, overview }
   */
  @UseGuards(JwtAuthGuard, InstructorOnlyGuard)
  @Post('create/course-final-step')
  async createFinalStep(@Body() dto: CreateFinalStepDto) {
    return this.courseService.createFinalStep(dto);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UPDATE STEPS (edit flow — 6 steps)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * PUT /auth/course/v1/update/course-step-1
   * FormData: payload (JSON) + course_image (file, optional)
   */
  @UseGuards(JwtAuthGuard, InstructorOnlyGuard)
  @Put('update/course-step-1')
  @UseInterceptors(FileInterceptor('course_image', multerMemory))
  async updateStep1(
    @UploadedFile() file: Express.Multer.File,
    @Body('payload') rawPayload: string,
  ) {
    const dto = JSON.parse(rawPayload || '{}');
    return this.courseService.updateStep1(dto, file);
  }

  /** PUT /auth/course/v1/update/course-step-2 — learning_points */
  @UseGuards(JwtAuthGuard, InstructorOnlyGuard)
  @Put('update/course-step-2')
  async updateStep2(@Body() dto: UpdateStep2Dto) {
    return this.courseService.updateStep2(dto);
  }

  /** PUT /auth/course/v1/update/course-step-3 — skills_you_gain */
  @UseGuards(JwtAuthGuard, InstructorOnlyGuard)
  @Put('update/course-step-3')
  async updateStep3(@Body() dto: UpdateStep3Dto) {
    return this.courseService.updateStep3(dto);
  }

  /** PUT /auth/course/v1/update/course-step-4 — about_course */
  @UseGuards(JwtAuthGuard, InstructorOnlyGuard)
  @Put('update/course-step-4')
  async updateStep4(@Body() dto: UpdateStep4Dto) {
    return this.courseService.updateStep4(dto);
  }

  /** PUT /auth/course/v1/update/course-step-5 — instructor + description */
  @UseGuards(JwtAuthGuard, InstructorOnlyGuard)
  @Put('update/course-step-5')
  async updateStep5(@Body() dto: UpdateStep5Dto) {
    return this.courseService.updateStep5(dto);
  }

  /** PUT /auth/course/v1/update/course-step-6 — overview */
  @UseGuards(JwtAuthGuard, InstructorOnlyGuard)
  @Put('update/course-step-6')
  async updateStep6(@Body() dto: UpdateStep6Dto) {
    return this.courseService.updateStep6(dto);
  }

  /** PUT /auth/course/v1/update-course — toggle status (draft/published/unpublished) */
  @UseGuards(JwtAuthGuard, InstructorOnlyGuard)
  @Put('update-course')
  async updateCourseStatus(@Body() dto: UpdateCourseStatusDto) {
    return this.courseService.updateCourseStatus(dto);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LISTING & DETAILS
  // ─────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('dashboard/stats')
  async getDashboardStats(@Req() req: AuthenticatedRequest) {
    return this.courseService.getInstructorDashboardStats(req.user.userId);
  }

  /**
   * GET /auth/course/v1/get-all-course
   * Query: page, size, search, category_id, status, course_type, course_schedule, live_classes
   */
  @UseGuards(OptionalJwtAuthGuard)
  @Get('get-all-course')
  async getAllCourses(
    @Query() query: Record<string, string>,
    @Req() req: AuthenticatedRequest,
  ) {
    const locale = this.extractLocale(req, query);
    return this.courseService.getAllCourses(
      query,
      req?.user?.userId || null,
      locale,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('students/list')
  async getStudentsList(
    @Query('course_id') course_id: string,
    @Query('courseId') courseId: string,
    @Query('batch_id') batch_id: string,
    @Query('batchId') batchId: string,
    @Query('search') search: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const finalCourseId = course_id || courseId;
    const finalBatchId = batch_id || batchId;
    const userId = req.user.userId;
    return this.courseService.getStudentsList(
      userId,
      finalCourseId,
      finalBatchId,
      search,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('students/:id/details')
  async getStudentDetails(
    @Param('id') studentId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.userId;
    return this.courseService.getStudentDetails(userId, studentId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('students/:id/submissions')
  async getStudentSubmissions(
    @Param('id') studentId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.userId;
    return this.courseService.getStudentSubmissions(userId, studentId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('student/evaluations')
  async getMyEvaluations(
    @Req() req: AuthenticatedRequest,
    @Query('courseId') courseId?: string,
    @Query('batchId') batchId?: string,
  ) {
    const userId = req.user.userId;
    return this.courseService.getMyEvaluations(userId, courseId, batchId);
  }

  /**
   * GET /auth/course/v1/course-details/:course_id
   * Full CourseInfoDataProp shape
   */
  @UseGuards(OptionalJwtAuthGuard)
  @Get('course-details/:course_id')
  async getCourseDetails(
    @Param('course_id') courseId: string,
    @Req() req: any,
    @Query() query: Record<string, string>,
  ) {
    const userId = req.user?.userId || req.user?.sub || null;
    const locale = this.extractLocale(req, query);
    return this.courseService.getCourseDetails(courseId, userId, locale);
  }

  /**
   * GET /auth/course/v1/search?q=
   * Public search across published courses
   */
  @Get('search')
  async searchCourses(@Query('q') q: string) {
    return this.courseService.searchCourses(q ?? '');
  }

  /**
   * DELETE /auth/course/v1/remove-from-favorite
   */
  @UseGuards(JwtAuthGuard)
  @Delete('remove-from-favorite')
  async removeFromFavorite(
    @Query('course_id') courseId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.userId;
    return this.courseService.removeFromFavorite(userId, courseId);
  }

  /**
   * DELETE /auth/course/v1/:course_id
   */
  @UseGuards(JwtAuthGuard, InstructorOnlyGuard)
  @Delete(':course_id')
  async deleteCourse(@Param('course_id') courseId: string) {
    return this.courseService.deleteCourse(courseId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LESSON CRUD
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * POST /auth/course/v1/lesson/create
   * FormData: lessonData (JSON) + photo (file, optional)
   */
  @UseGuards(JwtAuthGuard, InstructorOnlyGuard)
  @Post('lesson/create')
  @UseInterceptors(FilesInterceptor('photo', 10, multerMemory))
  async createLesson(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('lessonData') rawData: string,
  ) {
    const dto = JSON.parse(rawData);
    return this.courseService.createLesson(dto, files);
  }

  /**
   * PUT /auth/course/v1/lesson/update
   * FormData: data (JSON) + photo (file, optional)
   */
  @UseGuards(JwtAuthGuard, InstructorOnlyGuard)
  @Put('lesson/update')
  @UseInterceptors(FilesInterceptor('photo', 10, multerMemory))
  async updateLesson(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('data') rawData: string,
  ) {
    const dto = JSON.parse(rawData);
    return this.courseService.updateLesson(dto, files);
  }

  /**
   * DELETE /auth/course/v1/lesson/delete/:lesson_id
   * Cascade-deletes all sub-lessons
   */
  @UseGuards(JwtAuthGuard, InstructorOnlyGuard)
  @Delete('lesson/delete/:lesson_id')
  async deleteLesson(@Param('lesson_id') lessonId: string) {
    return this.courseService.deleteLesson(lessonId);
  }

  /**
   * PUT /auth/course/v1/lesson/reorder
   */
  @UseGuards(JwtAuthGuard, InstructorOnlyGuard)
  @Put('lesson/reorder')
  async reorderLessons(
    @Body()
    body: {
      course_id: string;
      orders: { lesson_id: string; order: number }[];
    },
  ) {
    return this.courseService.reorderLessons(body.course_id, body.orders);
  }

  /**
   * GET /auth/course/v1/get-sublesson-lesson?course_id=
   * Returns lessons with embedded sub-lessons array
   */
  @UseGuards(JwtAuthGuard)
  @Get('get-sublesson-lesson')
  async getLessonsWithSublessons(
    @Query('course_id') courseId: string,
    @Req() req: any,
    @Query() query: Record<string, string>,
  ) {
    const locale = this.extractLocale(req, query);
    return this.courseService.getLessonsWithSublessons(courseId, locale);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUBLESSON CRUD
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * POST /auth/course/v1/Sublesson/create
   * FormData: data (JSON) + photo (file, optional)
   */
  @UseGuards(JwtAuthGuard, InstructorOnlyGuard)
  @Post('Sublesson/create')
  @UseInterceptors(FilesInterceptor('photo', 10, multerMemory))
  async createSubLesson(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('data') rawData: string,
  ) {
    const dto = JSON.parse(rawData);
    return this.courseService.createSubLesson(dto, files);
  }

  /**
   * PUT /auth/course/v1/Sublesson/update
   * FormData: data (JSON) + photo (file, optional)
   */
  @UseGuards(JwtAuthGuard, InstructorOnlyGuard)
  @Put('Sublesson/update')
  @UseInterceptors(FilesInterceptor('photo', 10, multerMemory))
  async updateSubLesson(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('data') rawData: string,
  ) {
    const dto = JSON.parse(rawData);
    return this.courseService.updateSubLesson(dto, files);
  }

  /**
   * DELETE /auth/course/v1/sublesson/delete/:sublesson_id
   */
  @UseGuards(JwtAuthGuard, InstructorOnlyGuard)
  @Delete('sublesson/delete/:sublesson_id')
  async deleteSubLesson(@Param('sublesson_id') sublessonId: string) {
    return this.courseService.deleteSubLesson(sublessonId);
  }

  /**
   * PUT /auth/course/v1/sublesson/reorder
   */
  @UseGuards(JwtAuthGuard, InstructorOnlyGuard)
  @Put('sublesson/reorder')
  async reorderSublessons(
    @Body()
    body: {
      lesson_id: string;
      orders: { sublesson_id: string; order: number }[];
    },
  ) {
    return this.courseService.reorderSublessons(body.lesson_id, body.orders);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BATCH CRUD (Embedded array)
  // ─────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, InstructorOnlyGuard)
  @Post('batch/create')
  async createBatch(
    @Body()
    dto: {
      course_id: string;
      batchName: string;
      teacher: string | null;
    },
  ) {
    return this.courseService.createBatch(dto);
  }

  @UseGuards(JwtAuthGuard, InstructorOnlyGuard)
  @Put('batch/update')
  async updateBatch(
    @Body()
    dto: {
      course_id: string;
      batch_id: string;
      batchName: string;
      teacher: string | null;
    },
  ) {
    return this.courseService.updateBatch(dto);
  }

  @UseGuards(JwtAuthGuard, InstructorOnlyGuard)
  @Delete('batch/delete/:course_id/:batch_id')
  async deleteBatch(
    @Param('course_id') courseId: string,
    @Param('batch_id') batchId: string,
  ) {
    return this.courseService.deleteBatch(courseId, batchId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FAVORITES ENDPOINTS
  // ─────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Patch('add-to-favorite')
  async addToFavorite(
    @Body() dto: { course_id: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.userId;
    return this.courseService.addToFavorite(userId, dto.course_id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('get-favorite-courses')
  async getFavoriteCourses(@Req() req: AuthenticatedRequest) {
    const userId = req.user.userId;
    return this.courseService.getFavoriteCourses(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('get-enrolled-courses')
  async getEnrolledCourses(
    @Query() query: Record<string, string>,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.userId;
    return this.courseService.getEnrolledCourses(userId, query);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PROGRESS TRACKING
  // ─────────────────────────────────────────────────────────────────────────

  /** GET /auth/course/v1/progress?course_id=&batch_id= */
  @UseGuards(JwtAuthGuard)
  @Get('progress')
  async getCourseProgress(
    @Query('course_id') courseId: string,
    @Query('batch_id') batchId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const studentId = req.user.userId;
    return this.courseService.getCourseProgress(studentId, courseId, batchId);
  }

  /** POST /auth/course/v1/progress/complete-lesson */
  @UseGuards(JwtAuthGuard)
  @Post('progress/complete-lesson')
  async markLessonComplete(
    @Body() dto: { lesson_id: string; course_id: string; batch_id: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const studentId = req.user.userId;
    return this.courseService.markLessonComplete(
      studentId,
      dto.lesson_id,
      dto.course_id,
      dto.batch_id,
    );
  }

  /** POST /auth/course/v1/progress/complete-material */
  @UseGuards(JwtAuthGuard)
  @Post('progress/complete-material')
  async markMaterialComplete(
    @Body() dto: { material_url: string; course_id: string; batch_id: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const studentId = req.user.userId;
    return this.courseService.markMaterialComplete(
      studentId,
      dto.material_url,
      dto.course_id,
      dto.batch_id,
    );
  }
}
