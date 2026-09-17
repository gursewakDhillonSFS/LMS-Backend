import {
  Controller,
  Get,
  Patch,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/interfaces/auth-request.interface';

@UseGuards(JwtAuthGuard)
@Controller('auth/notification/v1')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get('my-notifications')
  async getMyNotifications(@Req() req: AuthenticatedRequest) {
    return this.notificationService.getUserNotifications(req.user.userId);
  }

  @Patch('mark-read/:id')
  async markRead(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.notificationService.markAsRead(req.user.userId, id);
  }

  @Patch('mark-all-read')
  async markAllRead(@Req() req: AuthenticatedRequest) {
    return this.notificationService.markAllAsRead(req.user.userId);
  }
}
