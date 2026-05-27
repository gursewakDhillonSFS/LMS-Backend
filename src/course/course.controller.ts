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
  UseGuards,
  UseInterceptors,
  Patch,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
    return this.courseService.getAllCourses(
      query,
      req?.user?.userId || null,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('students/list')
  async getStudentsList(
    @Query('course_id') courseId: string,
    @Query('batch_id') batchId: string,
    @Query('search') search: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.userId;
    return this.courseService.getStudentsList(
      userId,
      courseId,
      batchId,
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

  /**
   * GET /auth/course/v1/course-details/:course_id
   * Full CourseInfoDataProp shape
   */
  @UseGuards(OptionalJwtAuthGuard)
  @Get('course-details/:course_id')
  async getCourseDetails(
    @Param('course_id') courseId: string,
    @Req() req: any,
  ) {
    const userId = req.user?.userId || req.user?.sub || null;
    return this.courseService.getCourseDetails(courseId, userId);
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
  @UseInterceptors(FileInterceptor('photo', multerMemory))
  async createLesson(
    @UploadedFile() file: Express.Multer.File,
    @Body('lessonData') rawData: string,
  ) {
    const dto = JSON.parse(rawData);
    return this.courseService.createLesson(dto, file);
  }

  /**
   * PUT /auth/course/v1/lesson/update
   * FormData: data (JSON) + photo (file, optional)
   */
  @UseGuards(JwtAuthGuard, InstructorOnlyGuard)
  @Put('lesson/update')
  @UseInterceptors(FileInterceptor('photo', multerMemory))
  async updateLesson(
    @UploadedFile() file: Express.Multer.File,
    @Body('data') rawData: string,
  ) {
    const dto = JSON.parse(rawData);
    return this.courseService.updateLesson(dto, file);
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
   * GET /auth/course/v1/get-sublesson-lesson?course_id=
   * Returns lessons with embedded sub-lessons array
   */
  @UseGuards(JwtAuthGuard)
  @Get('get-sublesson-lesson')
  async getLessonsWithSublessons(@Query('course_id') courseId: string) {
    return this.courseService.getLessonsWithSublessons(courseId);
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
  @UseInterceptors(FileInterceptor('photo', multerMemory))
  async createSubLesson(
    @UploadedFile() file: Express.Multer.File,
    @Body('data') rawData: string,
  ) {
    const dto = JSON.parse(rawData);
    return this.courseService.createSubLesson(dto, file);
  }

  /**
   * PUT /auth/course/v1/Sublesson/update
   * FormData: data (JSON) + photo (file, optional)
   */
  @UseGuards(JwtAuthGuard, InstructorOnlyGuard)
  @Put('Sublesson/update')
  @UseInterceptors(FileInterceptor('photo', multerMemory))
  async updateSubLesson(
    @UploadedFile() file: Express.Multer.File,
    @Body('data') rawData: string,
  ) {
    const dto = JSON.parse(rawData);
    return this.courseService.updateSubLesson(dto, file);
  }

  /**
   * DELETE /auth/course/v1/sublesson/delete/:sublesson_id
   */
  @UseGuards(JwtAuthGuard, InstructorOnlyGuard)
  @Delete('sublesson/delete/:sublesson_id')
  async deleteSubLesson(@Param('sublesson_id') sublessonId: string) {
    return this.courseService.deleteSubLesson(sublessonId);
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
  // CART, FAVORITES & PURCHASE ENDPOINTS
  // ─────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('add-to-cart')
  async addToCart(
    @Query('course_ids') courseId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.userId;
    return this.courseService.addToCart(userId, courseId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('add-to-cart/list')
  async getCartList(@Req() req: AuthenticatedRequest) {
    const userId = req.user.userId;
    return this.courseService.getCartList(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('remove-from-cart/:course_id')
  async removeFromCart(
    @Param('course_id') courseId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.userId;
    return this.courseService.removeFromCart(userId, courseId);
  }

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
  @Post('course/purchase')
  async purchaseCourses(
    @Body() dto: { course_ids: string[]; batch_ids?: string[] },
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.userId;
    return this.courseService.purchaseCourses(
      userId,
      dto.course_ids,
      dto.batch_ids,
    );
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

  /** POST /auth/course/v1/progress/complete-sublesson */
  @UseGuards(JwtAuthGuard)
  @Post('progress/complete-sublesson')
  async markSublessonComplete(
    @Body() dto: { sublesson_id: string; course_id: string; batch_id: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const studentId = req.user.userId;
    return this.courseService.markSublessonComplete(
      studentId,
      dto.sublesson_id,
      dto.course_id,
      dto.batch_id,
    );
  }
}
