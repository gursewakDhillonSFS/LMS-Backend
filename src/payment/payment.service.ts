import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Stripe from 'stripe';
import {
  CoursePurchase,
  CoursePurchaseDocument,
} from './schemas/course-purchase.schema';
import {
  OrganisationEarning,
  OrganisationEarningDocument,
} from './schemas/organisation-earning.schema';
import {
  TeacherEarning,
  TeacherEarningDocument,
} from './schemas/teacher-earning.schema';
import {
  FinancialDocument,
  FinancialDocumentDocument,
} from './schemas/financial-document.schema';
import { Course, CourseDocument } from '../course/schemas/course.schema';
import { CourseService } from '../course/course.service';
import {
  Organisation,
  OrganisationDocument,
} from '../organisation/schemas/organisation.schema';
import { Teacher, TeacherDocument } from '../teacher/schemas/teacher.schema';
import { PurchaseCourseDto, RefundPurchaseDto } from './dto/payment.dto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private stripe: Stripe | null = null;
  private readonly platformFeePercent: number;
  private readonly defaultTeacherPercent: number;
  private readonly refundWindowDays = 2;

  constructor(
    private readonly config: ConfigService,
    @InjectModel(CoursePurchase.name)
    private purchaseModel: Model<CoursePurchaseDocument>,
    @InjectModel(OrganisationEarning.name)
    private orgEarningModel: Model<OrganisationEarningDocument>,
    @InjectModel(TeacherEarning.name)
    private teacherEarningModel: Model<TeacherEarningDocument>,
    @InjectModel(FinancialDocument.name)
    private finDocModel: Model<FinancialDocumentDocument>,
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
    @InjectModel(Organisation.name)
    private orgModel: Model<OrganisationDocument>,
    @InjectModel(Teacher.name) private teacherModel: Model<TeacherDocument>,
    private readonly courseService: CourseService,
  ) {
    const key = this.config.get<string>('STRIPE_SECRET_KEY');
    if (key) {
      this.stripe = new Stripe(key);
    }
    this.platformFeePercent = parseInt(
      this.config.get<string>('PLATFORM_FEE_PERCENTAGE') || '5',
      10,
    );
    this.defaultTeacherPercent = parseInt(
      this.config.get<string>('TEACHER_DEFAULT_REVENUE_PERCENT') || '20',
      10,
    );
  }

  private getStripe(): Stripe {
    if (!this.stripe) {
      throw new BadRequestException(
        'Stripe is not configured. Set STRIPE_SECRET_KEY.',
      );
    }
    return this.stripe;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SINGLE COURSE PURCHASE CHECKOUT
  // ─────────────────────────────────────────────────────────────────────────────

  async purchaseCourse(userId: string, dto: PurchaseCourseDto) {
    const courseId = dto.course_id;
    const course = await this.courseModel.findById(courseId).lean();
    if (!course) throw new NotFoundException('Course not found');

    // Check for duplicate purchase
    const existingPurchase = await this.purchaseModel.findOne({
      studentId: new Types.ObjectId(userId),
      courseId: new Types.ObjectId(courseId),
      status: { $in: ['paid', 'pending'] },
    });
    if (existingPurchase?.status === 'paid') {
      throw new ConflictException('You have already purchased this course');
    }
    // Cancel any stale pending purchase
    if (existingPurchase?.status === 'pending') {
      existingPurchase.status = 'cancelled';
      await existingPurchase.save();
    }

    // Resolve organisation
    const orgId = course.organisation_id;
    if (!orgId) throw new BadRequestException('Course has no organisation');

    const org = await this.orgModel.findById(orgId).lean();
    if (!org) throw new NotFoundException('Organisation not found');

    // Determine price
    const price = course.course_price || 0;
    const isFree =
      course.course_type === 'free' ||
      course.course_type === 'Free' ||
      price <= 0;

    // Resolve batch teacher
    let batchId: Types.ObjectId | null = null;
    let teacherId: Types.ObjectId | null = null;

    if (dto.batch_id) {
      batchId = new Types.ObjectId(dto.batch_id);
      // Look up the batch's teacher
      const batchDoc = course.batch?.find(
        (b) => b._id?.toString() === dto.batch_id,
      );
      if (batchDoc?.teacher) {
        const teacher = await this.teacherModel
          .findById(batchDoc.teacher)
          .lean();
        if (teacher) teacherId = teacher._id as Types.ObjectId;
      }
    } else if (course.batch?.length) {
      batchId = course.batch[0]._id
        ? new Types.ObjectId(course.batch[0]._id)
        : null;
      if (course.batch[0]?.teacher) {
        const teacher = await this.teacherModel
          .findById(course.batch[0].teacher)
          .lean();
        if (teacher) teacherId = teacher._id as Types.ObjectId;
      }
    }

    // Calculate revenue split
    const grossCents = Math.round(price * 100);
    const platformFeeCents = Math.round(
      (grossCents * this.platformFeePercent) / 100,
    );
    const remaining = grossCents - platformFeeCents;

    const teacherPercent =
      course.teacherRevenuePercent ??
      (org as any).defaultTeacherRevenuePercent ??
      this.defaultTeacherPercent;

    let teacherShareCents = 0;
    if (teacherId && teacherPercent > 0) {
      teacherShareCents = Math.round((remaining * teacherPercent) / 100);
    }
    const orgShareCents = remaining - teacherShareCents;

    // ── Free course — enroll immediately ─────────────────────────────────────
    if (isFree) {
      await this.courseService.purchaseCourses(
        userId,
        [courseId],
        batchId ? [batchId.toString()] : [],
      );

      const purchase = await this.purchaseModel.create({
        studentId: new Types.ObjectId(userId),
        courseId: new Types.ObjectId(courseId),
        batchId,
        organisationId: orgId,
        teacherId,
        grossAmountCents: 0,
        platformFeePercent: this.platformFeePercent,
        platformFeeCents: 0,
        organisationShareCents: 0,
        teacherShareCents: 0,
        teacherRevenuePercent: teacherPercent,
        status: 'paid',
        purchasedAt: new Date(),
      });

      // Create financial document for free enrollment
      await this.finDocModel.create({
        type: 'student_purchase',
        referenceId: purchase._id,
        ownerId: new Types.ObjectId(userId),
        ownerType: 'student',
        amountCents: 0,
        description: `Free enrollment: ${course.course_name || 'Course'}`,
        metadata: { courseId, courseName: course.course_name },
      });

      return {
        status: true,
        message: 'Enrolled successfully (free course)',
        data: {
          enrolled: true,
          purchaseId: String(purchase._id),
        },
      };
    }

    // ── Paid course — create Stripe Checkout ────────────────────────────────
    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    const purchase = await this.purchaseModel.create({
      studentId: new Types.ObjectId(userId),
      courseId: new Types.ObjectId(courseId),
      batchId,
      organisationId: orgId,
      teacherId,
      grossAmountCents: grossCents,
      platformFeePercent: this.platformFeePercent,
      platformFeeCents: platformFeeCents,
      organisationShareCents: orgShareCents,
      teacherShareCents: teacherShareCents,
      teacherRevenuePercent: teacherPercent,
      status: 'pending',
    });

    const session = await this.getStripe().checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: grossCents,
            product_data: {
              name: course.course_name || 'Course',
              images: course.course_image_url
                ? [course.course_image_url]
                : undefined,
            },
          },
        },
      ],
      success_url: `${frontendUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/checkout/cancel`,
      metadata: {
        purchaseId: String(purchase._id),
        userId,
        courseId,
        type: 'course_purchase',
      },
      client_reference_id: String(purchase._id),
    });

    purchase.stripeCheckoutSessionId = session.id;
    await purchase.save();

    return {
      status: true,
      message: 'Checkout session created',
      data: {
        enrolled: false,
        sessionId: session.id,
        url: session.url,
        purchaseId: String(purchase._id),
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // WEBHOOK HANDLING
  // ─────────────────────────────────────────────────────────────────────────────

  async handleWebhook(rawBody: Buffer, signature: string) {
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new BadRequestException('STRIPE_WEBHOOK_SECRET not configured');
    }

    let event: Stripe.Event;
    try {
      event = this.getStripe().webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
      );
    } catch (err) {
      this.logger.error('Webhook signature verification failed', err);
      throw new BadRequestException('Invalid webhook signature');
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.type === 'course_purchase') {
          await this.fulfillPurchase(session);
        }
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        await this.handleChargeRefunded(charge);
        break;
      }
    }

    return { received: true };
  }

  private async fulfillPurchase(session: Stripe.Checkout.Session) {
    const purchaseId =
      session.metadata?.purchaseId || session.client_reference_id;
    if (!purchaseId) {
      this.logger.warn('No purchaseId on Stripe session');
      return;
    }

    const purchase = await this.purchaseModel.findById(purchaseId);
    if (!purchase) {
      this.logger.warn(`Purchase ${purchaseId} not found`);
      return;
    }

    // Idempotent
    if (purchase.status === 'paid') return;

    // Enroll the student
    await this.courseService.purchaseCourses(
      String(purchase.studentId),
      [String(purchase.courseId)],
      purchase.batchId ? [String(purchase.batchId)] : [],
    );

    // Update purchase
    const now = new Date();
    purchase.status = 'paid';
    purchase.purchasedAt = now;
    purchase.refundDeadline = new Date(
      now.getTime() + this.refundWindowDays * 24 * 60 * 60 * 1000,
    );
    purchase.stripeCheckoutSessionId = session.id;
    purchase.stripePaymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id || null;
    await purchase.save();

    // Create organisation earning
    await this.orgEarningModel.create({
      organisationId: purchase.organisationId,
      courseId: purchase.courseId,
      purchaseId: purchase._id,
      grossAmountCents: purchase.grossAmountCents,
      platformFeeCents: purchase.platformFeeCents,
      earningCents: purchase.organisationShareCents,
      status: 'available',
    });

    // Create teacher earning (if applicable)
    if (purchase.teacherId && purchase.teacherShareCents > 0) {
      await this.teacherEarningModel.create({
        teacherId: purchase.teacherId,
        organisationId: purchase.organisationId,
        courseId: purchase.courseId,
        purchaseId: purchase._id,
        earningCents: purchase.teacherShareCents,
        status: 'available',
      });
    }

    // Create financial documents
    const course = await this.courseModel.findById(purchase.courseId).lean();
    const courseName = course?.course_name || 'Course';

    // Student receipt
    await this.finDocModel.create({
      type: 'student_purchase',
      referenceId: purchase._id,
      ownerId: purchase.studentId,
      ownerType: 'student',
      amountCents: purchase.grossAmountCents,
      description: `Purchase: ${courseName}`,
      metadata: {
        courseId: String(purchase.courseId),
        courseName,
        platformFeeCents: purchase.platformFeeCents,
      },
    });

    // Org earning document
    await this.finDocModel.create({
      type: 'organisation_earning',
      referenceId: purchase._id,
      ownerId: purchase.organisationId,
      ownerType: 'organisation',
      amountCents: purchase.organisationShareCents,
      description: `Earning from: ${courseName}`,
      metadata: {
        courseId: String(purchase.courseId),
        courseName,
        grossAmountCents: purchase.grossAmountCents,
        platformFeeCents: purchase.platformFeeCents,
      },
    });

    // Teacher earning document
    if (purchase.teacherId && purchase.teacherShareCents > 0) {
      await this.finDocModel.create({
        type: 'teacher_earning',
        referenceId: purchase._id,
        ownerId: purchase.teacherId,
        ownerType: 'teacher',
        amountCents: purchase.teacherShareCents,
        description: `Teaching earning from: ${courseName}`,
        metadata: {
          courseId: String(purchase.courseId),
          courseName,
        },
      });
    }

    this.logger.log(`Purchase ${purchaseId} fulfilled via Stripe`);
  }

  private async handleChargeRefunded(charge: Stripe.Charge) {
    // Find purchase by payment intent
    const piId =
      typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id;
    if (!piId) return;

    const purchase = await this.purchaseModel.findOne({
      stripePaymentIntentId: piId,
    });
    if (!purchase || purchase.status === 'refunded') return;

    purchase.status = 'refunded';
    purchase.refundedAt = new Date();
    await purchase.save();

    // Reverse earnings
    await this.orgEarningModel.updateMany(
      { purchaseId: purchase._id },
      { status: 'reversed' },
    );
    await this.teacherEarningModel.updateMany(
      { purchaseId: purchase._id },
      { status: 'reversed' },
    );

    // Create refund financial document
    const course = await this.courseModel.findById(purchase.courseId).lean();
    await this.finDocModel.create({
      type: 'refund',
      referenceId: purchase._id,
      ownerId: purchase.studentId,
      ownerType: 'student',
      amountCents: purchase.grossAmountCents,
      description: `Refund: ${course?.course_name || 'Course'}`,
      metadata: { courseId: String(purchase.courseId) },
    });

    this.logger.log(`Purchase ${purchase._id} refunded`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIRM SESSION (called by success page)
  // ─────────────────────────────────────────────────────────────────────────────

  async confirmSession(userId: string, sessionId: string) {
    const purchase = await this.purchaseModel.findOne({
      stripeCheckoutSessionId: sessionId,
      studentId: new Types.ObjectId(userId),
    });
    if (!purchase) throw new NotFoundException('Purchase not found');

    if (purchase.status === 'pending' && this.stripe) {
      const session =
        await this.stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status === 'paid') {
        await this.fulfillPurchase(session);
        const refreshed = await this.purchaseModel.findById(purchase._id);
        return {
          status: true,
          data: { purchaseStatus: refreshed?.status || 'paid' },
        };
      }
    }

    return { status: true, data: { purchaseStatus: purchase.status } };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CHECK PURCHASE ACCESS
  // ─────────────────────────────────────────────────────────────────────────────

  async checkPurchaseAccess(userId: string, courseId: string) {
    const purchase = await this.purchaseModel.findOne({
      studentId: new Types.ObjectId(userId),
      courseId: new Types.ObjectId(courseId),
      status: 'paid',
    });
    return {
      status: true,
      data: {
        purchased: !!purchase,
        purchaseId: purchase ? String(purchase._id) : null,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STUDENT PURCHASE HISTORY
  // ─────────────────────────────────────────────────────────────────────────────

  async getStudentPurchases(userId: string) {
    const purchases = await this.purchaseModel
      .find({
        studentId: new Types.ObjectId(userId),
        status: { $in: ['paid', 'refunded'] },
      })
      .sort({ createdAt: -1 })
      .lean();

    const courseIds = purchases.map((p) => p.courseId);
    const courses = await this.courseModel
      .find({ _id: { $in: courseIds } })
      .lean();
    const courseMap = new Map(courses.map((c) => [String(c._id), c]));

    const data = purchases.map((p) => {
      const course = courseMap.get(String(p.courseId));
      return {
        purchase_id: String(p._id),
        course_id: String(p.courseId),
        course_name: course?.course_name || 'Unknown',
        course_image_url: course?.course_image_url || null,
        gross_amount: p.grossAmountCents / 100,
        platform_fee: p.platformFeeCents / 100,
        status: p.status,
        purchased_at: p.purchasedAt,
        refund_deadline: p.refundDeadline,
        refunded_at: p.refundedAt,
      };
    });

    return { status: true, data };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PURCHASE DETAIL + INVOICE
  // ─────────────────────────────────────────────────────────────────────────────

  async getPurchaseDetail(userId: string, purchaseId: string) {
    const purchase = await this.purchaseModel.findById(purchaseId).lean();
    if (!purchase) throw new NotFoundException('Purchase not found');

    if (String(purchase.studentId) !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const course = await this.courseModel
      .findById(purchase.courseId)
      .lean();

    const docs = await this.finDocModel
      .find({
        referenceId: new Types.ObjectId(purchaseId),
        ownerId: new Types.ObjectId(userId),
      })
      .lean();

    return {
      status: true,
      data: {
        purchase: {
          purchase_id: String(purchase._id),
          course_id: String(purchase.courseId),
          course_name: course?.course_name || 'Unknown',
          course_image_url: course?.course_image_url || null,
          gross_amount: purchase.grossAmountCents / 100,
          platform_fee: purchase.platformFeeCents / 100,
          platform_fee_percent: purchase.platformFeePercent,
          org_share: purchase.organisationShareCents / 100,
          teacher_share: purchase.teacherShareCents / 100,
          teacher_revenue_percent: purchase.teacherRevenuePercent,
          currency: purchase.currency,
          status: purchase.status,
          purchased_at: purchase.purchasedAt,
          refund_deadline: purchase.refundDeadline,
          refunded_at: purchase.refundedAt,
          stripe_session_id: purchase.stripeCheckoutSessionId,
        },
        documents: docs.map((d) => ({
          type: d.type,
          amount: d.amountCents / 100,
          description: d.description,
          created_at: (d as any).createdAt,
        })),
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN REFUND
  // ─────────────────────────────────────────────────────────────────────────────

  async refundPurchase(purchaseId: string, dto: RefundPurchaseDto) {
    const purchase = await this.purchaseModel.findById(purchaseId);
    if (!purchase) throw new NotFoundException('Purchase not found');
    if (purchase.status !== 'paid') {
      throw new BadRequestException('Can only refund paid purchases');
    }

    // Check refund window
    if (purchase.refundDeadline && new Date() > purchase.refundDeadline) {
      throw new BadRequestException(
        'Refund window has expired (2 days from purchase)',
      );
    }

    // Refund via Stripe
    if (purchase.stripePaymentIntentId) {
      try {
        await this.getStripe().refunds.create({
          payment_intent: purchase.stripePaymentIntentId,
          reason: 'requested_by_customer',
        });
      } catch (err) {
        this.logger.error('Stripe refund failed', err);
        throw new BadRequestException('Stripe refund failed');
      }
    }

    // Mark as refunded (webhook will also trigger, but we do it eagerly)
    purchase.status = 'refunded';
    purchase.refundedAt = new Date();
    await purchase.save();

    // Reverse earnings
    await this.orgEarningModel.updateMany(
      { purchaseId: purchase._id },
      { status: 'reversed' },
    );
    await this.teacherEarningModel.updateMany(
      { purchaseId: purchase._id },
      { status: 'reversed' },
    );

    // Create refund document
    const course = await this.courseModel.findById(purchase.courseId).lean();
    await this.finDocModel.create({
      type: 'refund',
      referenceId: purchase._id,
      ownerId: purchase.studentId,
      ownerType: 'student',
      amountCents: purchase.grossAmountCents,
      description: `Refund: ${course?.course_name || 'Course'} — ${dto.reason || 'Customer request'}`,
      metadata: {
        courseId: String(purchase.courseId),
        reason: dto.reason || 'Customer request',
      },
    });

    return {
      status: true,
      message: 'Purchase refunded successfully',
    };
  }
}
