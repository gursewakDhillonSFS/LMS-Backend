import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { CommunicationService } from './communication.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/interfaces/auth-request.interface';

@UseGuards(JwtAuthGuard)
@Controller('communication/v1')
export class CommunicationController {
  constructor(private readonly communicationService: CommunicationService) {}

  @Get('user-chat-rooms')
  getRooms(@Req() req: AuthenticatedRequest) {
    return this.communicationService.getUserRooms(req.user.userId);
  }

  @Get('messages/:groupId')
  getMessages(
    @Param('groupId') groupId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Req() req: AuthenticatedRequest,
  ) {
    return this.communicationService.getMessages(
      req.user.userId,
      groupId,
      Number(page),
      Number(limit),
    );
  }
}
