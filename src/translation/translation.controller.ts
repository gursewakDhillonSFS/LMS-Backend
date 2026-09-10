import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InstructorOnlyGuard } from '../auth/instructor-only.guard';
import { TranslationService } from './translation.service';
import { TranslationQueueService } from './translation-queue.service';

@Controller('auth/course/v1/translations')
export class TranslationController {
  constructor(
    private readonly translationService: TranslationService,
    private readonly queueService: TranslationQueueService,
  ) {}

  /**
   * GET /auth/course/v1/translations/:course_id
   * Returns translations for all supported locales and status
   */
  @UseGuards(JwtAuthGuard)
  @Get(':course_id')
  async getTranslations(@Param('course_id') courseId: string) {
    return this.translationService.getCourseTranslations(courseId);
  }

  /**
   * PUT /auth/course/v1/translations/:course_id
   * Saves manual edits to a translation
   */
  @UseGuards(JwtAuthGuard, InstructorOnlyGuard)
  @Put(':course_id')
  async updateManualTranslation(
    @Param('course_id') courseId: string,
    @Body()
    body: {
      locale: string;
      course_name?: string;
      about_course?: string;
      description?: string;
      overview?: string;
      learning_points?: string[];
      skills_you_gain?: string[];
    },
  ) {
    return this.translationService.updateManualTranslation(
      courseId,
      body.locale,
      body,
    );
  }

  /**
   * POST /auth/course/v1/translations/:course_id/regenerate
   * Force re-enqueues translation job for the specified or all locales
   */
  @UseGuards(JwtAuthGuard, InstructorOnlyGuard)
  @Post(':course_id/regenerate')
  async regenerateTranslation(
    @Param('course_id') courseId: string,
    @Body() body: { locale?: string },
  ) {
    const locales = body.locale ? [body.locale] : ['pa', 'fr'];
    await this.queueService.enqueueCourseTranslation(courseId, locales, true);
    return {
      status: true,
      message: `Translation regeneration queued for [${locales.join(', ')}]`,
    };
  }
}
