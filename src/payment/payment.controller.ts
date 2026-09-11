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

@Controller('auth/course/v1')
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly stripeConnectService: StripeConnectService,
    private readonly earningsService: EarningsService,
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
  // STRIPE CONNECT — ORGANISATION
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('stripe/connect/organisation')
  createOrgConnect(@Req() req: AuthenticatedRequest) {
    // Get org from the instructor's profile
    const orgId = req.user.organisationId;
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
  getOrgConnectStatus(@Req() req: AuthenticatedRequest) {
    const orgId = req.user.organisationId;
    if (!orgId) {
      return {
        status: true,
        data: { connected: false, connect_status: 'pending' },
      };
    }
    return this.stripeConnectService.getOrgConnectStatus(orgId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STRIPE CONNECT — TEACHER
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('stripe/connect/teacher')
  createTeacherConnect(@Req() req: AuthenticatedRequest) {
    const teacherId = req.user.teacherId;
    if (!teacherId) {
      return { status: false, message: 'No teacher profile linked' };
    }
    return this.stripeConnectService.createTeacherConnectAccount(teacherId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('stripe/connect/teacher/status')
  getTeacherConnectStatus(@Req() req: AuthenticatedRequest) {
    const teacherId = req.user.teacherId;
    if (!teacherId) {
      return {
        status: true,
        data: { connected: false, connect_status: 'pending' },
      };
    }
    return this.stripeConnectService.getTeacherConnectStatus(teacherId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EARNINGS — ORGANISATION
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('earnings/organisation')
  getOrgEarnings(@Req() req: AuthenticatedRequest) {
    const orgId = req.user.organisationId;
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
  getTeacherEarnings(@Req() req: AuthenticatedRequest) {
    const teacherId = req.user.teacherId;
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
}
