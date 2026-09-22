import { Controller, Get, Post, Body, Param, Req, UseGuards } from '@nestjs/common';
import { CertificateService } from './certificate.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/interfaces/auth-request.interface';

@Controller(['certificate/v1', 'auth/certificate/v1'])
export class CertificateController {
  constructor(private readonly certificateService: CertificateService) {}

  @UseGuards(JwtAuthGuard)
  @Get('my')
  listMine(@Req() req: AuthenticatedRequest) {
    return this.certificateService.listForStudent(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('claim')
  claimCertificate(
    @Body() dto: { courseId: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.certificateService.issueCertificate(req.user.userId, dto.courseId);
  }

  @Get('verify/:code')
  verify(@Param('code') code: string) {
    return this.certificateService.verify(code);
  }
}
