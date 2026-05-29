import { Controller, Post, Body, Req, UseGuards, BadRequestException } from '@nestjs/common';
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
  async createCourseReview(@Req() req, @Body() dto: { course_id: string; rating: number; review: string }) {
    if (!dto.course_id || !dto.rating || !dto.review) {
      throw new BadRequestException('course_id, rating, and review are required');
    }
    return this.courseService.createCourseReview(
      req.user.userId,
      req.user.name || 'Student',
      dto.course_id,
      dto.rating,
      dto.review
    );
  }
}
