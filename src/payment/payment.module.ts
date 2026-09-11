import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { StripeConnectService } from './stripe-connect.service';
import { EarningsService } from './earnings.service';
import {
  CoursePurchase,
  CoursePurchaseSchema,
} from './schemas/course-purchase.schema';
import {
  OrganisationEarning,
  OrganisationEarningSchema,
} from './schemas/organisation-earning.schema';
import {
  TeacherEarning,
  TeacherEarningSchema,
} from './schemas/teacher-earning.schema';
import {
  FinancialDocument,
  FinancialDocumentSchema,
} from './schemas/financial-document.schema';
import { Course, CourseSchema } from '../course/schemas/course.schema';
import {
  Organisation,
  OrganisationSchema,
} from '../organisation/schemas/organisation.schema';
import { Teacher, TeacherSchema } from '../teacher/schemas/teacher.schema';
import { CourseModule } from '../course/course.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CoursePurchase.name, schema: CoursePurchaseSchema },
      { name: OrganisationEarning.name, schema: OrganisationEarningSchema },
      { name: TeacherEarning.name, schema: TeacherEarningSchema },
      { name: FinancialDocument.name, schema: FinancialDocumentSchema },
      { name: Course.name, schema: CourseSchema },
      { name: Organisation.name, schema: OrganisationSchema },
      { name: Teacher.name, schema: TeacherSchema },
    ]),
    CourseModule,
    AuthModule,
  ],
  controllers: [PaymentController],
  providers: [PaymentService, StripeConnectService, EarningsService],
  exports: [PaymentService, StripeConnectService, EarningsService],
})
export class PaymentModule {}
