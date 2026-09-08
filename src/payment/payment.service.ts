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
import { Order, OrderDocument } from './schemas/order.schema';
import { Course, CourseDocument } from '../course/schemas/course.schema';
import { CourseService } from '../course/course.service';
import { CreateCheckoutSessionDto } from './dto/payment.dto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private stripe: Stripe | null = null;

  constructor(
    private readonly config: ConfigService,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
    private readonly courseService: CourseService,
  ) {
    const key = this.config.get<string>('STRIPE_SECRET_KEY');
    if (key) {
      this.stripe = new Stripe(key);
    }
  }

  private getStripe(): Stripe {
    if (!this.stripe) {
      throw new BadRequestException(
        'Stripe is not configured. Set STRIPE_SECRET_KEY.',
      );
    }
    return this.stripe;
  }

  async createCheckoutSession(userId: string, dto: CreateCheckoutSessionDto) {
    if (!dto.course_ids?.length) {
      throw new BadRequestException('course_ids required');
    }

    const courses = await this.courseModel
      .find({ _id: { $in: dto.course_ids.map((id) => new Types.ObjectId(id)) } })
      .lean();

    if (!courses.length) {
      throw new NotFoundException('No valid courses found');
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    let amountCents = 0;
    let hasPaid = false;

    for (const course of courses) {
      const price = course.course_price || 0;
      const isFree =
        course.course_type === 'free' ||
        course.course_type === 'Free' ||
        price <= 0;

      if (!isFree) {
        hasPaid = true;
        const cents = Math.round(price * 100);
        amountCents += cents;
        lineItems.push({
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: cents,
            product_data: {
              name: course.course_name || 'Course',
              images: course.course_image_url
                ? [course.course_image_url]
                : undefined,
            },
          },
        });
      }
    }

    // All free — enroll immediately
    if (!hasPaid) {
      await this.courseService.purchaseCourses(
        userId,
        dto.course_ids,
        dto.batch_ids,
      );
      const order = await this.orderModel.create({
        userId: new Types.ObjectId(userId),
        courseIds: dto.course_ids,
        batchIds: dto.batch_ids || [],
        amountCents: 0,
        status: 'free',
        stripeSessionId: null,
      });
      return {
        status: true,
        message: 'Enrolled successfully (free courses)',
        data: { enrolled: true, orderId: String(order._id) },
      };
    }

    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3002';

    const order = await this.orderModel.create({
      userId: new Types.ObjectId(userId),
      courseIds: dto.course_ids,
      batchIds: dto.batch_ids || [],
      amountCents,
      status: 'pending',
    });

    const session = await this.getStripe().checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: `${frontendUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/checkout/cancel`,
      metadata: {
        orderId: String(order._id),
        userId,
      },
      client_reference_id: String(order._id),
    });

    order.stripeSessionId = session.id;
    await order.save();

    return {
      status: true,
      message: 'Checkout session created',
      data: {
        enrolled: false,
        sessionId: session.id,
        url: session.url,
        orderId: String(order._id),
      },
    };
  }

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

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      await this.fulfillSession(session);
    }

    return { received: true };
  }

  private async fulfillSession(session: Stripe.Checkout.Session) {
    const orderId = session.metadata?.orderId || session.client_reference_id;
    if (!orderId) {
      this.logger.warn('No orderId on Stripe session');
      return;
    }

    const order = await this.orderModel.findById(orderId);
    if (!order) {
      this.logger.warn(`Order ${orderId} not found`);
      return;
    }

    if (order.status === 'paid' || order.status === 'free') {
      return; // idempotent
    }

    await this.courseService.purchaseCourses(
      String(order.userId),
      order.courseIds,
      order.batchIds,
    );

    order.status = 'paid';
    order.stripeSessionId = session.id;
    order.stripePaymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id || null;
    await order.save();

    this.logger.log(`Order ${orderId} fulfilled via Stripe`);
  }

  async confirmSession(userId: string, sessionId: string) {
    const order = await this.orderModel.findOne({
      stripeSessionId: sessionId,
      userId: new Types.ObjectId(userId),
    });
    if (!order) throw new NotFoundException('Order not found');

    if (order.status === 'pending' && this.stripe) {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status === 'paid') {
        await this.fulfillSession(session);
        const refreshed = await this.orderModel.findById(order._id);
        return {
          status: true,
          data: { orderStatus: refreshed?.status || 'paid' },
        };
      }
    }

    return { status: true, data: { orderStatus: order.status } };
  }
}
