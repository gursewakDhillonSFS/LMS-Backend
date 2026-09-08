import {
  Controller,
  Post,
  Body,
  Req,
  Headers,
  UseGuards,
  Get,
  Query,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentService } from './payment.service';
import { CreateCheckoutSessionDto } from './dto/payment.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/interfaces/auth-request.interface';

@Controller('auth/course/v1')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @UseGuards(JwtAuthGuard)
  @Post('checkout/create-session')
  createSession(
    @Body() dto: CreateCheckoutSessionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.paymentService.createCheckoutSession(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('checkout/confirm')
  confirmSession(
    @Query('session_id') sessionId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.paymentService.confirmSession(req.user.userId, sessionId);
  }

  @Post('webhook/stripe')
  handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    const rawBody = req.rawBody as Buffer;
    return this.paymentService.handleWebhook(rawBody, signature);
  }
}
