import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  TranslationJob,
  TranslationJobDocument,
} from '../course/schemas/translation-job.schema';

export type TranslationExecutor = (
  courseId: string,
  targetLocale: string,
) => Promise<void>;

@Injectable()
export class TranslationQueueService {
  private readonly logger = new Logger(TranslationQueueService.name);
  private isProcessing = false;
  private executor?: TranslationExecutor;

  constructor(
    @InjectModel(TranslationJob.name)
    private readonly jobModel: Model<TranslationJobDocument>,
  ) {}

  /**
   * Registers the translation execution handler to decouple queue from translation service
   */
  registerExecutor(executor: TranslationExecutor): void {
    this.executor = executor;
  }

  /**
   * Enqueues translation jobs for specified course across target locales
   */
  async enqueueCourseTranslation(
    courseId: string | Types.ObjectId,
    locales: string[] = ['pa', 'fr'],
    force = false,
  ): Promise<void> {
    const cid = new Types.ObjectId(String(courseId));

    for (const locale of locales) {
      // Check if job already pending or processing
      const existingJob = await this.jobModel.findOne({
        course_id: cid,
        target_locale: locale,
        status: { $in: ['pending', 'processing'] },
      });

      if (existingJob && !force) {
        this.logger.log(
          `Translation job for course ${courseId} (${locale}) already ${existingJob.status}`,
        );
        continue;
      }

      await this.jobModel.findOneAndUpdate(
        { course_id: cid, target_locale: locale },
        {
          $set: {
            status: 'pending',
            attempts: 0,
            error_message: null,
            locked_at: null,
          },
        },
        { upsert: true, new: true },
      );

      this.logger.log(
        `Enqueued translation job for course ${courseId} -> [${locale}]`,
      );
    }

    // Trigger immediate background execution without blocking the caller
    setImmediate(() => {
      this.processQueue().catch((err) =>
        this.logger.error(`Immediate processQueue error: ${err.message}`),
      );
    });
  }

  /**
   * Recurring cron worker that processes pending jobs every 15 seconds
   */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleCronWorker() {
    await this.processQueue();
  }

  /**
   * Process pending jobs in the queue
   */
  async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Find and lock the next pending job atomically
      const job = await this.jobModel.findOneAndUpdate(
        {
          status: 'pending',
          $or: [
            { locked_at: null },
            // Stale lock recovery (if server crashed while processing > 5 mins ago)
            { locked_at: { $lt: new Date(Date.now() - 5 * 60 * 1000) } },
          ],
        },
        {
          $set: {
            status: 'processing',
            locked_at: new Date(),
          },
          $inc: { attempts: 1 },
        },
        { new: true },
      );

      if (!job) {
        this.isProcessing = false;
        return;
      }

      this.logger.log(
        `Processing translation job ${job._id} for course ${job.course_id} (${job.target_locale}) [attempt ${job.attempts}/${job.max_attempts}]`,
      );

      try {
        if (this.executor) {
          await this.executor(
            job.course_id.toString(),
            job.target_locale,
          );
        } else {
          this.logger.warn(
            `No translation executor registered; skipping job ${job._id}`,
          );
          this.isProcessing = false;
          return;
        }

        await this.jobModel.findByIdAndUpdate(job._id, {
          $set: {
            status: 'completed',
            completed_at: new Date(),
            error_message: null,
          },
        });

        this.logger.log(
          `Successfully completed translation job ${job._id} for course ${job.course_id} (${job.target_locale})`,
        );
      } catch (err: any) {
        this.logger.error(
          `Translation execution failed for course ${job.course_id} (${job.target_locale}): ${err.message}`,
        );

        const isFailed = job.attempts >= job.max_attempts;
        await this.jobModel.findByIdAndUpdate(job._id, {
          $set: {
            status: isFailed ? 'failed' : 'pending',
            error_message: err.message || 'Unknown translation error',
            locked_at: null,
          },
        });
      }

      // Check if there are more jobs to process in this cycle
      this.isProcessing = false;
      setImmediate(() => this.processQueue());
    } catch (err: any) {
      this.logger.error(`Queue worker cycle error: ${err.message}`);
      this.isProcessing = false;
    }
  }

  /**
   * Retrieves translation job statuses for a course
   */
  async getCourseJobStatuses(courseId: string): Promise<Record<string, any>> {
    const jobs = await this.jobModel
      .find({ course_id: new Types.ObjectId(courseId) })
      .lean();

    const result: Record<string, any> = {
      en: { status: 'completed', source: 'original' },
      pa: { status: 'pending' },
      fr: { status: 'pending' },
    };

    for (const job of jobs) {
      result[job.target_locale] = {
        status: job.status,
        attempts: job.attempts,
        error: job.error_message,
        updated_at: (job as any).updatedAt || job.completed_at,
      };
    }

    return result;
  }
}
