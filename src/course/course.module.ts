import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CourseController } from './course.controller';
import { ReviewController } from './review.controller';
import { CourseService } from './course.service';
import { Course, CourseSchema } from './schemas/course.schema';
import { Lesson, LessonSchema } from './schemas/lesson.schema';
import { SubLesson, SubLessonSchema } from './schemas/sublesson.schema';
import { Review, ReviewSchema } from './schemas/review.schema';
import { Batch, BatchSchema } from './schemas/batch.schema';
import {
  BatchEnrolledStudent,
  BatchEnrolledStudentSchema,
} from './schemas/batch-enrolled-student.schema';
import { Teacher, TeacherSchema } from '../teacher/schemas/teacher.schema';
import { User, UserSchema } from '../user/schemas/user.schema';
import { Category, CategorySchema } from '../category/schemas/category.schema';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      // Course module schemas
      { name: Course.name, schema: CourseSchema },
      { name: Lesson.name, schema: LessonSchema },
      { name: SubLesson.name, schema: SubLessonSchema },
      // Phase 3/4 schemas — registered now, endpoints added later
      { name: Review.name, schema: ReviewSchema },
      { name: Batch.name, schema: BatchSchema },
      { name: BatchEnrolledStudent.name, schema: BatchEnrolledStudentSchema },
      // Cross-module refs (read-only lookups)
      { name: Teacher.name, schema: TeacherSchema },
      { name: User.name, schema: UserSchema },
      { name: Category.name, schema: CategorySchema },
    ]),
    CloudinaryModule,
    AuthModule,
  ],
  controllers: [CourseController, ReviewController],
  providers: [CourseService],
  exports: [CourseService],
})
export class CourseModule {}
