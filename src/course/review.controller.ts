import {
  Controller,
  Post,
  Put,
  Delete,
  Body,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CourseService } from './course.service';

@Controller('review/v1')
export class ReviewController {
  constructor(private readonly courseService: CourseService) {}

  @Post('get/review_course')
  async getCourseReviews(@Body() dto: { courseId: string }) {
    return this.courseService.getCourseReviews(dto.courseId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('create/review_course')
  async createCourseReview(
    @Req() req,
    @Body() dto: { course_id: string; rating: number; review: string },
  ) {
    if (!dto.course_id || !dto.rating || !dto.review) {
      throw new BadRequestException('course_id, rating, and review are required');
    }
    return this.courseService.createCourseReview(
      req.user.userId,
      req.user.name || 'Student',
      dto.course_id,
      dto.rating,
      dto.review,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Put('update/review_course')
  async updateCourseReview(
    @Req() req,
    @Body() dto: { course_id: string; rating: number; review: string },
  ) {
    if (!dto.course_id || !dto.rating || !dto.review) {
      throw new BadRequestException('course_id, rating, and review are required');
    }
    return this.courseService.updateCourseReview(
      req.user.userId,
      dto.course_id,
      dto.rating,
      dto.review,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete('delete/review_course')
  async deleteCourseReview(
    @Req() req,
    @Query('course_id') courseId: string,
  ) {
    if (!courseId) {
      throw new BadRequestException('course_id is required');
    }
    return this.courseService.deleteCourseReview(req.user.userId, courseId);
  }
}
