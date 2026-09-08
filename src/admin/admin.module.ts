import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { User, UserSchema } from '../user/schemas/user.schema';
import { Course, CourseSchema } from '../course/schemas/course.schema';
import { AnnouncementModule } from '../announcement/announcement.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Course.name, schema: CourseSchema },
    ]),
    AnnouncementModule,
    AuthModule,
  ],
  controllers: [AdminController],
})
export class AdminModule {}
