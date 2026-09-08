import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { OrganisationModule } from './organisation/organisation.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { TeacherModule } from './teacher/teacher.module';
import { CategoryModule } from './category/category.module';
import { CourseModule } from './course/course.module';
import { AssignmentModule } from './assignment/assignment.module';
import { QuizModule } from './quiz/quiz.module';
import { AnnouncementModule } from './announcement/announcement.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ScheduleModule as LmsScheduleModule } from './schedule/schedule.module';
import { PaymentModule } from './payment/payment.module';
import { CommunicationModule } from './communication/communication.module';
import { CertificateModule } from './certificate/certificate.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
    ScheduleModule.forRoot(),
    CloudinaryModule,
    AuthModule,
    UserModule,
    OrganisationModule,
    TeacherModule,
    CategoryModule,
    CourseModule,
    AssignmentModule,
    QuizModule,
    AnnouncementModule,
    LmsScheduleModule,
    PaymentModule,
    CommunicationModule,
    CertificateModule,
    AdminModule,
  ],
})
export class AppModule {
  constructor(private configService: ConfigService) {
    const requiredEnvVars = [
      'MONGODB_URI',
      'JWT_SECRET',
      'CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_API_KEY',
      'CLOUDINARY_API_SECRET',
    ];
    const missing = requiredEnvVars.filter(
      (key) => !this.configService.get(key),
    );
    if (missing.length > 0) {
      throw new Error(
        `❌ CRITICAL CONFIGURATION ERROR: Missing required environment variables: ${missing.join(', ')}`,
      );
    }
  }
}
