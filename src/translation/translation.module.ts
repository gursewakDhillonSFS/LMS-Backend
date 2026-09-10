import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Course, CourseSchema } from '../course/schemas/course.schema';
import { Lesson, LessonSchema } from '../course/schemas/lesson.schema';
import { SubLesson, SubLessonSchema } from '../course/schemas/sublesson.schema';
import {
  CourseTranslation,
  CourseTranslationSchema,
} from '../course/schemas/course-translation.schema';
import {
  LessonTranslation,
  LessonTranslationSchema,
} from '../course/schemas/lesson-translation.schema';
import {
  SubLessonTranslation,
  SubLessonTranslationSchema,
} from '../course/schemas/sublesson-translation.schema';
import {
  TranslationJob,
  TranslationJobSchema,
} from '../course/schemas/translation-job.schema';
import { NllbTranslationProvider } from './providers/nllb.provider';
import { FreeOpenSourceProvider } from './providers/free-opensource.provider';
import { CompositeTranslationProvider } from './providers/composite.provider';
import { TranslationQueueService } from './translation-queue.service';
import { TranslationService } from './translation.service';
import { TranslationController } from './translation.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Course.name, schema: CourseSchema },
      { name: Lesson.name, schema: LessonSchema },
      { name: SubLesson.name, schema: SubLessonSchema },
      { name: CourseTranslation.name, schema: CourseTranslationSchema },
      { name: LessonTranslation.name, schema: LessonTranslationSchema },
      { name: SubLessonTranslation.name, schema: SubLessonTranslationSchema },
      { name: TranslationJob.name, schema: TranslationJobSchema },
    ]),
  ],
  controllers: [TranslationController],
  providers: [
    NllbTranslationProvider,
    FreeOpenSourceProvider,
    CompositeTranslationProvider,
    TranslationQueueService,
    TranslationService,
  ],
  exports: [
    TranslationService,
    TranslationQueueService,
    CompositeTranslationProvider,
    MongooseModule,
  ],
})
export class TranslationModule {}
