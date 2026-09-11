import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Stripe from 'stripe';
import {
  Organisation,
  OrganisationDocument,
} from '../organisation/schemas/organisation.schema';
import { Teacher, TeacherDocument } from '../teacher/schemas/teacher.schema';

@Injectable()
export class StripeConnectService {
  private readonly logger = new Logger(StripeConnectService.name);
  private stripe: Stripe | null = null;

  constructor(
    private readonly config: ConfigService,
    @InjectModel(Organisation.name)
    private orgModel: Model<OrganisationDocument>,
    @InjectModel(Teacher.name) private teacherModel: Model<TeacherDocument>,
  ) {
    const key = this.config.get<string>('STRIPE_SECRET_KEY');
    if (key) {
      this.stripe = new Stripe(key);
    }
  }

  private getStripe(): Stripe {
    if (!this.stripe) {
      throw new BadRequestException('Stripe is not configured.');
    }
    return this.stripe;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ORGANISATION CONNECT
  // ─────────────────────────────────────────────────────────────────────────────

  async createOrgConnectAccount(orgId: string) {
    const org = await this.orgModel.findById(orgId);
    if (!org) throw new NotFoundException('Organisation not found');

    if (org.stripeConnectAccountId && org.stripeConnectStatus === 'active') {
      return {
        status: true,
        message: 'Stripe Connect already active',
        data: { connect_status: org.stripeConnectStatus },
      };
    }

    let accountId = org.stripeConnectAccountId;

    if (!accountId) {
      const account = await this.getStripe().accounts.create({
        type: 'express',
        email: org.email,
        business_type: 'company',
        company: { name: org.name },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
      accountId = account.id;
      org.stripeConnectAccountId = accountId;
      org.stripeConnectStatus = 'pending';
      await org.save();
    }

    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    const accountLink = await this.getStripe().accountLinks.create({
      account: accountId,
      refresh_url: `${frontendUrl}/settings?tab=payments&refresh=true`,
      return_url: `${frontendUrl}/settings?tab=payments&success=true`,
      type: 'account_onboarding',
    });

    return {
      status: true,
      message: 'Connect onboarding link created',
      data: {
        url: accountLink.url,
        connect_status: org.stripeConnectStatus,
      },
    };
  }

  async getOrgConnectStatus(orgId: string) {
    const org = await this.orgModel.findById(orgId);
    if (!org) throw new NotFoundException('Organisation not found');

    if (!org.stripeConnectAccountId) {
      return {
        status: true,
        data: {
          connected: false,
          connect_status: 'pending',
          charges_enabled: false,
          payouts_enabled: false,
        },
      };
    }

    try {
      const account = await this.getStripe().accounts.retrieve(
        org.stripeConnectAccountId,
      );

      const newStatus = account.charges_enabled ? 'active' : 'restricted';
      if (org.stripeConnectStatus !== newStatus) {
        org.stripeConnectStatus = newStatus;
        await org.save();
      }

      return {
        status: true,
        data: {
          connected: true,
          connect_status: org.stripeConnectStatus,
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          details_submitted: account.details_submitted,
        },
      };
    } catch (err) {
      this.logger.error('Failed to retrieve Stripe account', err);
      return {
        status: true,
        data: {
          connected: false,
          connect_status: org.stripeConnectStatus,
          charges_enabled: false,
          payouts_enabled: false,
        },
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEACHER CONNECT
  // ─────────────────────────────────────────────────────────────────────────────

  async createTeacherConnectAccount(teacherId: string) {
    const teacher = await this.teacherModel.findById(teacherId);
    if (!teacher) throw new NotFoundException('Teacher not found');

    if (
      teacher.stripeConnectAccountId &&
      teacher.stripeConnectStatus === 'active'
    ) {
      return {
        status: true,
        message: 'Stripe Connect already active',
        data: { connect_status: teacher.stripeConnectStatus },
      };
    }

    let accountId = teacher.stripeConnectAccountId;

    if (!accountId) {
      const account = await this.getStripe().accounts.create({
        type: 'express',
        email: teacher.email,
        business_type: 'individual',
        individual: {
          first_name: teacher.firstName,
          last_name: teacher.lastName,
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
      accountId = account.id;
      teacher.stripeConnectAccountId = accountId;
      teacher.stripeConnectStatus = 'pending';
      await teacher.save();
    }

    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    const accountLink = await this.getStripe().accountLinks.create({
      account: accountId,
      refresh_url: `${frontendUrl}/teacher/settings?tab=payments&refresh=true`,
      return_url: `${frontendUrl}/teacher/settings?tab=payments&success=true`,
      type: 'account_onboarding',
    });

    return {
      status: true,
      message: 'Connect onboarding link created',
      data: {
        url: accountLink.url,
        connect_status: teacher.stripeConnectStatus,
      },
    };
  }

  async getTeacherConnectStatus(teacherId: string) {
    const teacher = await this.teacherModel.findById(teacherId);
    if (!teacher) throw new NotFoundException('Teacher not found');

    if (!teacher.stripeConnectAccountId) {
      return {
        status: true,
        data: {
          connected: false,
          connect_status: 'pending',
          charges_enabled: false,
          payouts_enabled: false,
        },
      };
    }

    try {
      const account = await this.getStripe().accounts.retrieve(
        teacher.stripeConnectAccountId,
      );

      const newStatus = account.charges_enabled ? 'active' : 'restricted';
      if (teacher.stripeConnectStatus !== newStatus) {
        teacher.stripeConnectStatus = newStatus;
        await teacher.save();
      }

      return {
        status: true,
        data: {
          connected: true,
          connect_status: teacher.stripeConnectStatus,
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          details_submitted: account.details_submitted,
        },
      };
    } catch (err) {
      this.logger.error('Failed to retrieve Stripe teacher account', err);
      return {
        status: true,
        data: {
          connected: false,
          connect_status: teacher.stripeConnectStatus,
          charges_enabled: false,
          payouts_enabled: false,
        },
      };
    }
  }
}
