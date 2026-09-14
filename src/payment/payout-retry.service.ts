import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  TeacherEarning,
  TeacherEarningDocument,
} from './schemas/teacher-earning.schema';
import {
  OrganisationEarning,
  OrganisationEarningDocument,
} from './schemas/organisation-earning.schema';
import { Teacher, TeacherDocument } from '../teacher/schemas/teacher.schema';
import {
  Organisation,
  OrganisationDocument,
} from '../organisation/schemas/organisation.schema';
import { Course, CourseDocument } from '../course/schemas/course.schema';
import { PaymentService } from './payment.service';

export interface PayoutRetryResult {
  teachersProcessed: number;
  orgsProcessed: number;
  totalTransferredCents: number;
  availablePlatformBalanceCents: number;
  errors: string[];
}

@Injectable()
export class PayoutRetryService {
  private readonly logger = new Logger(PayoutRetryService.name);

  constructor(
    @InjectModel(TeacherEarning.name)
    private teacherEarningModel: Model<TeacherEarningDocument>,
    @InjectModel(OrganisationEarning.name)
    private orgEarningModel: Model<OrganisationEarningDocument>,
    @InjectModel(Teacher.name)
    private teacherModel: Model<TeacherDocument>,
    @InjectModel(Organisation.name)
    private orgModel: Model<OrganisationDocument>,
    @InjectModel(Course.name)
    private courseModel: Model<CourseDocument>,
    private paymentService: PaymentService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // AUTOMATED CRON (Runs every 2 hours)
  // ─────────────────────────────────────────────────────────────────────────────
  @Cron(CronExpression.EVERY_2_HOURS)
  async handleScheduledPayouts() {
    this.logger.log('Starting automated background payout retry worker...');
    try {
      const result = await this.retryAllPendingPayouts();
      this.logger.log(
        `Automated payout cycle complete: ${result.teachersProcessed} teacher(s), ${result.orgsProcessed} org(s) processed. Total: $${(result.totalTransferredCents / 100).toFixed(2)} USD transferred.`,
      );
    } catch (err: any) {
      this.logger.error(`Automated payout worker failed: ${err.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RETRY ALL PENDING PAYOUTS (Platform-Wide / Admin)
  // ─────────────────────────────────────────────────────────────────────────────
  async retryAllPendingPayouts(): Promise<PayoutRetryResult> {
    const stripe = this.paymentService.getStripe();
    const result: PayoutRetryResult = {
      teachersProcessed: 0,
      orgsProcessed: 0,
      totalTransferredCents: 0,
      availablePlatformBalanceCents: 0,
      errors: [],
    };

    // 1. Check Platform Available Balance
    let availableCents = 0;
    try {
      const balance = await stripe.balance.retrieve();
      const usdBal = balance.available.find((b) => b.currency === 'usd');
      availableCents = usdBal?.amount || 0;
      result.availablePlatformBalanceCents = availableCents;
    } catch (err: any) {
      const msg = `Failed to retrieve platform Stripe balance: ${err.message}`;
      this.logger.error(msg);
      result.errors.push(msg);
      return result;
    }

    // 2. Process Pending Teacher Earnings
    const pendingTeachers = await this.teacherEarningModel
      .find({
        status: { $in: ['pending', 'action_required', 'available'] },
        stripeTransferId: null,
      })
      .sort({ createdAt: 1 });

    for (const item of pendingTeachers) {
      try {
        const teacher = await this.teacherModel.findById(item.teacherId);
        if (!teacher?.stripeConnectAccountId || teacher.stripeConnectStatus !== 'active') {
          if (item.status !== 'action_required') {
            item.status = 'action_required';
            item.failureReason = 'Stripe account setup required';
            await item.save();
          }
          continue;
        }

        if (availableCents < item.earningCents) {
          item.status = 'pending';
          item.failureReason = 'Awaiting funds settlement';
          await item.save();
          this.logger.warn(
            `Insufficient available platform balance (${availableCents} cents) for teacher transfer ${item._id} (${item.earningCents} cents)`,
          );
          continue;
        }

        const course = await this.courseModel.findById(item.courseId).lean();
        const courseName = course?.course_name || 'Course';

        const transfer = await stripe.transfers.create({
          amount: item.earningCents,
          currency: 'usd',
          destination: teacher.stripeConnectAccountId,
          description: `Teacher revenue share for ${courseName}`,
          metadata: { purchaseId: String(item.purchaseId), earningId: String(item._id) },
        });

        item.stripeTransferId = transfer.id;
        item.status = 'paid';
        item.transferredAt = new Date();
        item.failureReason = null;
        await item.save();

        availableCents -= item.earningCents;
        result.totalTransferredCents += item.earningCents;
        result.teachersProcessed++;
        this.logger.log(
          `Dispatched pending teacher payout: $${(item.earningCents / 100).toFixed(2)} to ${teacher.stripeConnectAccountId} (transfer: ${transfer.id})`,
        );
      } catch (err: any) {
        const msg = `Teacher payout transfer error for earning ${item._id}: ${err.message}`;
        this.logger.warn(msg);
        result.errors.push(msg);
        item.status = 'pending';
        item.failureReason =
          err.code === 'balance_insufficient'
            ? 'Awaiting funds settlement'
            : err.message || 'Transfer pending';
        await item.save();
      }
    }

    // 3. Process Pending Organisation Earnings
    const pendingOrgs = await this.orgEarningModel
      .find({
        status: { $in: ['pending', 'action_required', 'available'] },
        stripeTransferId: null,
      })
      .sort({ createdAt: 1 });

    for (const item of pendingOrgs) {
      try {
        const org = await this.orgModel.findById(item.organisationId);
        if (!org?.stripeConnectAccountId || org.stripeConnectStatus !== 'active') {
          if (item.status !== 'action_required') {
            item.status = 'action_required';
            item.failureReason = 'Stripe account setup required';
            await item.save();
          }
          continue;
        }

        if (availableCents < item.earningCents) {
          item.status = 'pending';
          item.failureReason = 'Awaiting funds settlement';
          await item.save();
          this.logger.warn(
            `Insufficient available platform balance (${availableCents} cents) for org transfer ${item._id} (${item.earningCents} cents)`,
          );
          continue;
        }

        const course = await this.courseModel.findById(item.courseId).lean();
        const courseName = course?.course_name || 'Course';

        const transfer = await stripe.transfers.create({
          amount: item.earningCents,
          currency: 'usd',
          destination: org.stripeConnectAccountId,
          description: `Org revenue share for ${courseName}`,
          metadata: { purchaseId: String(item.purchaseId), earningId: String(item._id) },
        });

        item.stripeTransferId = transfer.id;
        item.status = 'paid';
        item.transferredAt = new Date();
        item.failureReason = null;
        await item.save();

        availableCents -= item.earningCents;
        result.totalTransferredCents += item.earningCents;
        result.orgsProcessed++;
        this.logger.log(
          `Dispatched pending org payout: $${(item.earningCents / 100).toFixed(2)} to ${org.stripeConnectAccountId} (transfer: ${transfer.id})`,
        );
      } catch (err: any) {
        const msg = `Org payout transfer error for earning ${item._id}: ${err.message}`;
        this.logger.warn(msg);
        result.errors.push(msg);
        item.status = 'pending';
        item.failureReason =
          err.code === 'balance_insufficient'
            ? 'Awaiting funds settlement'
            : err.message || 'Transfer pending';
        await item.save();
      }
    }

    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RETRY TEACHER PENDING PAYOUTS (On-Demand)
  // ─────────────────────────────────────────────────────────────────────────────
  async retryTeacherPendingPayouts(teacherId: string): Promise<{
    processed: number;
    transferredCents: number;
    message: string;
  }> {
    const teacher = await this.teacherModel.findById(teacherId);
    if (!teacher?.stripeConnectAccountId || teacher.stripeConnectStatus !== 'active') {
      return {
        processed: 0,
        transferredCents: 0,
        message: 'Stripe Connect account is not active yet',
      };
    }

    const stripe = this.paymentService.getStripe();
    const balance = await stripe.balance.retrieve();
    const usdBal = balance.available.find((b) => b.currency === 'usd');
    let availableCents = usdBal?.amount || 0;

    const items = await this.teacherEarningModel.find({
      teacherId: new Types.ObjectId(teacherId),
      status: { $in: ['pending', 'action_required', 'available'] },
      stripeTransferId: null,
    });

    let processed = 0;
    let transferredCents = 0;

    for (const item of items) {
      if (availableCents < item.earningCents) {
        item.status = 'pending';
        item.failureReason = 'Awaiting funds settlement';
        await item.save();
        continue;
      }

      try {
        const course = await this.courseModel.findById(item.courseId).lean();
        const courseName = course?.course_name || 'Course';

        const transfer = await stripe.transfers.create({
          amount: item.earningCents,
          currency: 'usd',
          destination: teacher.stripeConnectAccountId,
          description: `Teacher revenue share for ${courseName}`,
          metadata: { purchaseId: String(item.purchaseId), earningId: String(item._id) },
        });

        item.stripeTransferId = transfer.id;
        item.status = 'paid';
        item.transferredAt = new Date();
        item.failureReason = null;
        await item.save();

        availableCents -= item.earningCents;
        transferredCents += item.earningCents;
        processed++;
      } catch (err: any) {
        item.status = 'pending';
        item.failureReason =
          err.code === 'balance_insufficient'
            ? 'Awaiting funds settlement'
            : err.message || 'Transfer pending';
        await item.save();
      }
    }

    return {
      processed,
      transferredCents,
      message:
        processed > 0
          ? `Dispatched ${processed} pending payout(s) ($${(transferredCents / 100).toFixed(2)} USD)`
          : 'No pending payouts ready for dispatch',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RETRY ORGANISATION PENDING PAYOUTS (On-Demand)
  // ─────────────────────────────────────────────────────────────────────────────
  async retryOrgPendingPayouts(orgId: string): Promise<{
    processed: number;
    transferredCents: number;
    message: string;
  }> {
    const org = await this.orgModel.findById(orgId);
    if (!org?.stripeConnectAccountId || org.stripeConnectStatus !== 'active') {
      return {
        processed: 0,
        transferredCents: 0,
        message: 'Stripe Connect account is not active yet',
      };
    }

    const stripe = this.paymentService.getStripe();
    const balance = await stripe.balance.retrieve();
    const usdBal = balance.available.find((b) => b.currency === 'usd');
    let availableCents = usdBal?.amount || 0;

    const items = await this.orgEarningModel.find({
      organisationId: new Types.ObjectId(orgId),
      status: { $in: ['pending', 'action_required', 'available'] },
      stripeTransferId: null,
    });

    let processed = 0;
    let transferredCents = 0;

    for (const item of items) {
      if (availableCents < item.earningCents) {
        item.status = 'pending';
        item.failureReason = 'Awaiting funds settlement';
        await item.save();
        continue;
      }

      try {
        const course = await this.courseModel.findById(item.courseId).lean();
        const courseName = course?.course_name || 'Course';

        const transfer = await stripe.transfers.create({
          amount: item.earningCents,
          currency: 'usd',
          destination: org.stripeConnectAccountId,
          description: `Org revenue share for ${courseName}`,
          metadata: { purchaseId: String(item.purchaseId), earningId: String(item._id) },
        });

        item.stripeTransferId = transfer.id;
        item.status = 'paid';
        item.transferredAt = new Date();
        item.failureReason = null;
        await item.save();

        availableCents -= item.earningCents;
        transferredCents += item.earningCents;
        processed++;
      } catch (err: any) {
        item.status = 'pending';
        item.failureReason =
          err.code === 'balance_insufficient'
            ? 'Awaiting funds settlement'
            : err.message || 'Transfer pending';
        await item.save();
      }
    }

    return {
      processed,
      transferredCents,
      message:
        processed > 0
          ? `Dispatched ${processed} pending payout(s) ($${(transferredCents / 100).toFixed(2)} USD)`
          : 'No pending payouts ready for dispatch',
    };
  }
}
