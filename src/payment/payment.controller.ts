import {
  Controller,
  Post,
  Body,
  Req,
  Headers,
  UseGuards,
  Get,
  Query,
  Param,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentService } from './payment.service';
import { StripeConnectService } from './stripe-connect.service';
import { EarningsService } from './earnings.service';
import { PurchaseCourseDto, RefundPurchaseDto } from './dto/payment.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/interfaces/auth-request.interface';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../user/schemas/user.schema';
import {
  Organisation,
  OrganisationDocument,
} from '../organisation/schemas/organisation.schema';
import { Teacher, TeacherDocument } from '../teacher/schemas/teacher.schema';

import { PayoutRetryService } from './payout-retry.service';

@Controller('auth/course/v1')
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly stripeConnectService: StripeConnectService,
    private readonly earningsService: EarningsService,
    private readonly payoutRetryService: PayoutRetryService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Organisation.name)
    private readonly orgModel: Model<OrganisationDocument>,
    @InjectModel(Teacher.name)
    private readonly teacherModel: Model<TeacherDocument>,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // SINGLE COURSE PURCHASE
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('purchase')
  purchaseCourse(
    @Body() dto: PurchaseCourseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.paymentService.purchaseCourse(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('purchase/:courseId/access')
  checkPurchaseAccess(
    @Param('courseId') courseId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.paymentService.checkPurchaseAccess(
      req.user.userId,
      courseId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('purchases')
  getStudentPurchases(@Req() req: AuthenticatedRequest) {
    return this.paymentService.getStudentPurchases(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('purchases/:purchaseId')
  getPurchaseDetail(
    @Param('purchaseId') purchaseId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.paymentService.getPurchaseDetail(
      req.user.userId,
      purchaseId,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CHECKOUT CONFIRM (success page callback)
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('checkout/confirm')
  confirmSession(
    @Query('session_id') sessionId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.paymentService.confirmSession(req.user.userId, sessionId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STRIPE WEBHOOK
  // ─────────────────────────────────────────────────────────────────────────────

  @Post('webhook/stripe')
  handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    const rawBody = req.rawBody as Buffer;
    return this.paymentService.handleWebhook(rawBody, signature);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ─── HELPER RESOLVERS ────────────────────────────────────────────────────────
  private async resolveOrganisationId(
    req: AuthenticatedRequest,
    explicitOrgId?: string,
  ): Promise<string | null> {
    // 1. Explicit ID passed in query or body
    if (explicitOrgId && Types.ObjectId.isValid(explicitOrgId)) {
      return String(explicitOrgId);
    }
    // 2. Already on request user object (e.g. from JwtStrategy)
    if (req.user?.organisationId && Types.ObjectId.isValid(req.user.organisationId)) {
      return String(req.user.organisationId);
    }

    const userId = req.user?.userId;
    const email = req.user?.email?.toLowerCase();

    // 3. Check User record in DB
    let user: UserDocument | null = null;
    if (userId && Types.ObjectId.isValid(userId)) {
      user = await this.userModel.findById(userId);
    } else if (email) {
      user = await this.userModel.findOne({ email });
    }

    if (user?.organisationId) {
      return String(user.organisationId);
    }

    // 4. Check Teacher record in DB
    let teacher: TeacherDocument | null = null;
    if (user?.teacherId) {
      teacher = await this.teacherModel.findById(user.teacherId);
    } else if (email) {
      teacher = await this.teacherModel.findOne({ email });
    }

    if (teacher?.organisationId) {
      if (user) {
        await this.userModel.findByIdAndUpdate(user._id, {
          organisationId: teacher.organisationId,
        });
      }
      return String(teacher.organisationId);
    }

    // 5. Search Organisation by creatorUserId
    if (user?._id) {
      const orgByCreator = await this.orgModel.findOne({
        creatorUserId: user._id,
      });
      if (orgByCreator) {
        await this.userModel.findByIdAndUpdate(user._id, {
          organisationId: orgByCreator._id,
        });
        if (teacher?._id && !teacher.organisationId) {
          await this.teacherModel.findByIdAndUpdate(teacher._id, {
            organisationId: orgByCreator._id,
          });
        }
        return String(orgByCreator._id);
      }
    }

    // 6. Search Organisation by user email
    if (email) {
      const orgByEmail = await this.orgModel.findOne({ email });
      if (orgByEmail) {
        if (user) {
          await this.userModel.findByIdAndUpdate(user._id, {
            organisationId: orgByEmail._id,
          });
        }
        if (teacher?._id && !teacher.organisationId) {
          await this.teacherModel.findByIdAndUpdate(teacher._id, {
            organisationId: orgByEmail._id,
          });
        }
        return String(orgByEmail._id);
      }
    }

    // 7. Search Organisation by teacher reference
    if (teacher?._id) {
      const orgWithTeacher = await this.orgModel.findOne({
        teachers: teacher._id,
      });
      if (orgWithTeacher) {
        if (user) {
          await this.userModel.findByIdAndUpdate(user._id, {
            organisationId: orgWithTeacher._id,
          });
        }
        return String(orgWithTeacher._id);
      }
    }

    return null;
  }

  private async resolveTeacherId(
    req: AuthenticatedRequest,
    explicitTeacherId?: string,
  ): Promise<string | null> {
    if (explicitTeacherId && Types.ObjectId.isValid(explicitTeacherId)) {
      return String(explicitTeacherId);
    }
    if (req.user?.teacherId && Types.ObjectId.isValid(req.user.teacherId)) {
      return String(req.user.teacherId);
    }

    const userId = req.user?.userId;
    const email = req.user?.email?.toLowerCase();

    // 1. Check User in DB
    let user: UserDocument | null = null;
    if (userId && Types.ObjectId.isValid(userId)) {
      user = await this.userModel.findById(userId);
    } else if (email) {
      user = await this.userModel.findOne({ email });
    }

    if (user?.teacherId) {
      return String(user.teacherId);
    }

    // 2. Check Teacher by email
    if (email) {
      const teacher = await this.teacherModel.findOne({ email });
      if (teacher) {
        if (user) {
          await this.userModel.findByIdAndUpdate(user._id, {
            teacherId: teacher._id,
          });
        }
        return String(teacher._id);
      }
    }

    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STRIPE CONNECT — ORGANISATION
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('stripe/connect/organisation')
  async createOrgConnect(
    @Req() req: AuthenticatedRequest,
    @Body('organisationId') bodyOrgId?: string,
    @Body('organization_id') bodyOrgId2?: string,
    @Query('organisationId') queryOrgId?: string,
    @Query('organization_id') queryOrgId2?: string,
  ) {
    const orgId = await this.resolveOrganisationId(
      req,
      bodyOrgId || bodyOrgId2 || queryOrgId || queryOrgId2,
    );
    if (!orgId) {
      return {
        status: false,
        message: 'No organisation linked to your account',
      };
    }
    return this.stripeConnectService.createOrgConnectAccount(orgId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('stripe/connect/organisation/status')
  async getOrgConnectStatus(
    @Req() req: AuthenticatedRequest,
    @Query('organisationId') queryOrgId?: string,
    @Query('organization_id') queryOrgId2?: string,
  ) {
    const orgId = await this.resolveOrganisationId(
      req,
      queryOrgId || queryOrgId2,
    );
    if (!orgId) {
      return {
        status: true,
        data: { connected: false, connect_status: 'pending' },
      };
    }
    return this.stripeConnectService.getOrgConnectStatus(orgId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('stripe/connect/organisation/dashboard')
  async getOrgDashboard(
    @Req() req: AuthenticatedRequest,
    @Body('organisationId') bodyOrgId?: string,
    @Body('organization_id') bodyOrgId2?: string,
    @Query('organisationId') queryOrgId?: string,
    @Query('organization_id') queryOrgId2?: string,
  ) {
    const orgId = await this.resolveOrganisationId(
      req,
      bodyOrgId || bodyOrgId2 || queryOrgId || queryOrgId2,
    );
    if (!orgId) {
      return {
        status: false,
        message: 'No organisation linked to your account',
      };
    }
    return this.stripeConnectService.getOrgDashboardLink(orgId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STRIPE CONNECT — TEACHER
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('stripe/connect/teacher')
  async createTeacherConnect(
    @Req() req: AuthenticatedRequest,
    @Body('teacherId') bodyTeacherId?: string,
    @Body('instructor_id') bodyTeacherId2?: string,
    @Query('teacherId') queryTeacherId?: string,
    @Query('instructor_id') queryTeacherId2?: string,
  ) {
    const teacherId = await this.resolveTeacherId(
      req,
      bodyTeacherId || bodyTeacherId2 || queryTeacherId || queryTeacherId2,
    );
    if (!teacherId) {
      return { status: false, message: 'No teacher profile linked' };
    }
    return this.stripeConnectService.createTeacherConnectAccount(teacherId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('stripe/connect/teacher/status')
  async getTeacherConnectStatus(
    @Req() req: AuthenticatedRequest,
    @Query('teacherId') queryTeacherId?: string,
    @Query('instructor_id') queryTeacherId2?: string,
  ) {
    const teacherId = await this.resolveTeacherId(
      req,
      queryTeacherId || queryTeacherId2,
    );
    if (!teacherId) {
      return {
        status: true,
        data: { connected: false, connect_status: 'pending' },
      };
    }
    return this.stripeConnectService.getTeacherConnectStatus(teacherId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('stripe/connect/teacher/dashboard')
  async getTeacherDashboard(
    @Req() req: AuthenticatedRequest,
    @Body('teacherId') bodyTeacherId?: string,
    @Body('instructor_id') bodyTeacherId2?: string,
    @Query('teacherId') queryTeacherId?: string,
    @Query('instructor_id') queryTeacherId2?: string,
  ) {
    const teacherId = await this.resolveTeacherId(
      req,
      bodyTeacherId || bodyTeacherId2 || queryTeacherId || queryTeacherId2,
    );
    if (!teacherId) {
      return { status: false, message: 'No teacher profile linked' };
    }
    return this.stripeConnectService.getTeacherDashboardLink(teacherId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EARNINGS — ORGANISATION
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('earnings/organisation')
  async getOrgEarnings(
    @Req() req: AuthenticatedRequest,
    @Query('organisationId') queryOrgId?: string,
    @Query('organization_id') queryOrgId2?: string,
  ) {
    const orgId = await this.resolveOrganisationId(
      req,
      queryOrgId || queryOrgId2,
    );
    if (!orgId) {
      return { status: true, data: { summary: {}, items: [] } };
    }
    return this.earningsService.getOrganisationEarnings(orgId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EARNINGS — TEACHER
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('earnings/teacher')
  async getTeacherEarnings(
    @Req() req: AuthenticatedRequest,
    @Query('teacherId') queryTeacherId?: string,
    @Query('instructor_id') queryTeacherId2?: string,
  ) {
    const teacherId = await this.resolveTeacherId(
      req,
      queryTeacherId || queryTeacherId2,
    );
    if (!teacherId) {
      return { status: true, data: { summary: {}, items: [] } };
    }
    return this.earningsService.getTeacherEarnings(teacherId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EARNINGS — ADMIN
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('earnings/admin')
  getAdminEarnings() {
    return this.earningsService.getAdminFinancialOverview();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN — REFUND
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('refund/:purchaseId')
  refundPurchase(
    @Param('purchaseId') purchaseId: string,
    @Body() dto: RefundPurchaseDto,
  ) {
    return this.paymentService.refundPurchase(purchaseId, dto);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PAYOUT SYNC & RETRIES (ON-DEMAND)
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('stripe/connect/teacher/sync-payouts')
  async syncTeacherPayouts(
    @Req() req: AuthenticatedRequest,
    @Body('teacherId') bodyTeacherId?: string,
    @Query('teacherId') queryTeacherId?: string,
  ) {
    const teacherId = await this.resolveTeacherId(
      req,
      bodyTeacherId || queryTeacherId,
    );
    if (!teacherId) {
      return { status: false, message: 'No teacher profile linked' };
    }
    const result =
      await this.payoutRetryService.retryTeacherPendingPayouts(teacherId);
    return { status: true, data: result, message: result.message };
  }

  @UseGuards(JwtAuthGuard)
  @Post('stripe/connect/organisation/sync-payouts')
  async syncOrgPayouts(
    @Req() req: AuthenticatedRequest,
    @Body('organisationId') bodyOrgId?: string,
    @Query('organisationId') queryOrgId?: string,
  ) {
    const orgId = await this.resolveOrganisationId(
      req,
      bodyOrgId || queryOrgId,
    );
    if (!orgId) {
      return { status: false, message: 'No organisation profile linked' };
    }
    const result = await this.payoutRetryService.retryOrgPendingPayouts(orgId);
    return { status: true, data: result, message: result.message };
  }

  @UseGuards(JwtAuthGuard)
  @Post('payment/admin/payouts/retry')
  async retryAdminPayouts() {
    const result = await this.payoutRetryService.retryAllPendingPayouts();
    return {
      status: true,
      data: result,
      message: `Processed ${result.teachersProcessed} teacher(s), ${result.orgsProcessed} organisation(s). Total transferred: $${(result.totalTransferredCents / 100).toFixed(2)} USD`,
    };
  }
}

