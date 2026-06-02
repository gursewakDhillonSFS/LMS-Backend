import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AssignmentController } from './assignment.controller';
import { AssignmentService } from './assignment.service';
import { Assignment, AssignmentSchema } from './schemas/assignment.schema';
import {
  AssignmentSubmission,
  AssignmentSubmissionSchema,
} from './schemas/assignment-submission.schema';
import { Course, CourseSchema } from '../course/schemas/course.schema';
import { User, UserSchema } from '../user/schemas/user.schema';
import { Schedule, ScheduleSchema } from '../schedule/schemas/schedule.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Assignment.name, schema: AssignmentSchema },
      { name: AssignmentSubmission.name, schema: AssignmentSubmissionSchema },
      // Cross-module read-only references
      { name: Course.name, schema: CourseSchema },
      { name: User.name, schema: UserSchema },
      { name: Schedule.name, schema: ScheduleSchema },
    ]),
    AuthModule,
  ],
  controllers: [AssignmentController],
  providers: [AssignmentService],
  exports: [AssignmentService],
})
export class AssignmentModule {}
