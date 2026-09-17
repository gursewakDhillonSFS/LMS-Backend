import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';
import { Quiz, QuizSchema } from './schemas/quiz.schema';
import {
  QuizSubmission,
  QuizSubmissionSchema,
} from './schemas/quiz-submission.schema';
import { Course, CourseSchema } from '../course/schemas/course.schema';
import { User, UserSchema } from '../user/schemas/user.schema';
import { Schedule, ScheduleSchema } from '../schedule/schemas/schedule.schema';
import { Announcement, AnnouncementSchema } from '../announcement/schemas/announcement.schema';
import { NotificationModule } from '../notification/notification.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Quiz.name, schema: QuizSchema },
      { name: QuizSubmission.name, schema: QuizSubmissionSchema },
      // Cross-module read-only references
      { name: Course.name, schema: CourseSchema },
      { name: User.name, schema: UserSchema },
      { name: Schedule.name, schema: ScheduleSchema },
      { name: Announcement.name, schema: AnnouncementSchema },
    ]),
    AuthModule,
    NotificationModule,
  ],
  controllers: [QuizController],
  providers: [QuizService],
  exports: [QuizService],
})
export class QuizModule {}
