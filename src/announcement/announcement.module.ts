import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnnouncementController } from './announcement.controller';
import { AnnouncementService } from './announcement.service';
import { AnnouncementGateway } from './announcement.gateway';
import { AnnouncementScheduler } from './announcement.scheduler';
import {
  Announcement,
  AnnouncementSchema,
} from './schemas/announcement.schema';
import { Course, CourseSchema } from '../course/schemas/course.schema';
import { User, UserSchema } from '../user/schemas/user.schema';
import { Assignment, AssignmentSchema } from '../assignment/schemas/assignment.schema';
import { Quiz, QuizSchema } from '../quiz/schemas/quiz.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Announcement.name, schema: AnnouncementSchema },
      { name: Course.name, schema: CourseSchema },
      { name: User.name, schema: UserSchema },
      { name: Assignment.name, schema: AssignmentSchema },
      { name: Quiz.name, schema: QuizSchema },
    ]),
    AuthModule,
  ],
  controllers: [AnnouncementController],
  providers: [AnnouncementService, AnnouncementGateway, AnnouncementScheduler],
  exports: [AnnouncementService, AnnouncementGateway],
})
export class AnnouncementModule {}
