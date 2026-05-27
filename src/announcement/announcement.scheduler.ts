import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AnnouncementService } from './announcement.service';

@Injectable()
export class AnnouncementScheduler {
  private readonly logger = new Logger('AnnouncementScheduler');

  constructor(private readonly service: AnnouncementService) {}

  // Run at midnight every day
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleMidnightPublish() {
    this.logger.log(
      '🕛 Running midnight scheduler to publish pending announcements...',
    );
    try {
      const res = await this.service.publishScheduledAnnouncements();
      this.logger.log(
        `🕛 Finished midnight scheduler. Published ${res.publishedCount} announcements.`,
      );
    } catch (err) {
      this.logger.error('❌ Error executing midnight scheduled publish:', err);
    }
  }
}
