import { Controller, Post, Body } from '@nestjs/common';
import { CourseService } from './course.service';

@Controller('review/v1')
export class ReviewController {
  constructor(private readonly courseService: CourseService) {}

  @Post('get/review_course')
  async getCourseReviews(@Body() dto: { courseId: string }) {
    return this.courseService.getCourseReviews(dto.courseId);
  }
}
