import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { TeacherController } from './teacher.controller';
import { TeacherService } from './teacher.service';
import { Teacher, TeacherSchema } from './schemas/teacher.schema';
import { User, UserSchema } from '../user/schemas/user.schema';
import {
  Organisation,
  OrganisationSchema,
} from '../organisation/schemas/organisation.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Teacher.name, schema: TeacherSchema },
      { name: User.name, schema: UserSchema },
      { name: Organisation.name, schema: OrganisationSchema },
    ]),
    AuthModule,
    ConfigModule,
  ],
  controllers: [TeacherController],
  providers: [TeacherService],
  exports: [TeacherService, MongooseModule],
})
export class TeacherModule {}
