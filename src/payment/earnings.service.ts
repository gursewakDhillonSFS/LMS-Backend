import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  OrganisationEarning,
  OrganisationEarningDocument,
} from './schemas/organisation-earning.schema';
import {
  TeacherEarning,
  TeacherEarningDocument,
} from './schemas/teacher-earning.schema';
import {
  CoursePurchase,
  CoursePurchaseDocument,
} from './schemas/course-purchase.schema';
import {
  FinancialDocument,
  FinancialDocumentDocument,
} from './schemas/financial-document.schema';
import { Course, CourseDocument } from '../course/schemas/course.schema';

@Injectable()
export class EarningsService {
  private readonly logger = new Logger(EarningsService.name);

  constructor(
    @InjectModel(OrganisationEarning.name)
    private orgEarningModel: Model<OrganisationEarningDocument>,
    @InjectModel(TeacherEarning.name)
    private teacherEarningModel: Model<TeacherEarningDocument>,
    @InjectModel(CoursePurchase.name)
    private purchaseModel: Model<CoursePurchaseDocument>,
    @InjectModel(FinancialDocument.name)
    private finDocModel: Model<FinancialDocumentDocument>,
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // ORGANISATION EARNINGS
  // ─────────────────────────────────────────────────────────────────────────────

  async getOrganisationEarnings(orgId: string) {
    const earnings = await this.orgEarningModel
      .find({ organisationId: new Types.ObjectId(orgId) })
      .sort({ createdAt: -1 })
      .lean();

    const courseIds = [...new Set(earnings.map((e) => String(e.courseId)))];
    const courses = await this.courseModel
      .find({ _id: { $in: courseIds.map((id) => new Types.ObjectId(id)) } })
      .lean();
    const courseMap = new Map(courses.map((c) => [String(c._id), c]));

    // Summary
    const totalEarnings = earnings
      .filter((e) => e.status !== 'reversed')
      .reduce((sum, e) => sum + e.earningCents, 0);
    const totalPlatformFees = earnings
      .filter((e) => e.status !== 'reversed')
      .reduce((sum, e) => sum + e.platformFeeCents, 0);
    const totalGross = earnings
      .filter((e) => e.status !== 'reversed')
      .reduce((sum, e) => sum + e.grossAmountCents, 0);
    const totalSales = earnings.filter((e) => e.status !== 'reversed').length;

    const items = earnings.map((e) => ({
      earning_id: String(e._id),
      course_id: String(e.courseId),
      course_name: courseMap.get(String(e.courseId))?.course_name || 'Unknown',
      gross_amount: e.grossAmountCents / 100,
      platform_fee: e.platformFeeCents / 100,
      earning: e.earningCents / 100,
      status: e.status,
      created_at: (e as any).createdAt,
    }));

    return {
      status: true,
      data: {
        summary: {
          total_earnings: totalEarnings / 100,
          total_platform_fees: totalPlatformFees / 100,
          total_gross: totalGross / 100,
          total_sales: totalSales,
        },
        items,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEACHER EARNINGS
  // ─────────────────────────────────────────────────────────────────────────────

  async getTeacherEarnings(teacherId: string) {
    const earnings = await this.teacherEarningModel
      .find({ teacherId: new Types.ObjectId(teacherId) })
      .sort({ createdAt: -1 })
      .lean();

    const courseIds = [...new Set(earnings.map((e) => String(e.courseId)))];
    const courses = await this.courseModel
      .find({ _id: { $in: courseIds.map((id) => new Types.ObjectId(id)) } })
      .lean();
    const courseMap = new Map(courses.map((c) => [String(c._id), c]));

    const totalEarnings = earnings
      .filter((e) => e.status !== 'reversed')
      .reduce((sum, e) => sum + e.earningCents, 0);
    const totalSales = earnings.filter((e) => e.status !== 'reversed').length;

    const items = earnings.map((e) => ({
      earning_id: String(e._id),
      course_id: String(e.courseId),
      course_name: courseMap.get(String(e.courseId))?.course_name || 'Unknown',
      earning: e.earningCents / 100,
      status: e.status,
      created_at: (e as any).createdAt,
    }));

    return {
      status: true,
      data: {
        summary: {
          total_earnings: totalEarnings / 100,
          total_sales: totalSales,
        },
        items,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN FINANCIAL OVERVIEW
  // ─────────────────────────────────────────────────────────────────────────────

  async getAdminFinancialOverview() {
    const totalPurchases = await this.purchaseModel.countDocuments({
      status: 'paid',
    });
    const totalRefunds = await this.purchaseModel.countDocuments({
      status: 'refunded',
    });

    // Aggregate totals
    const purchaseAgg = await this.purchaseModel.aggregate([
      { $match: { status: 'paid' } },
      {
        $group: {
          _id: null,
          totalGross: { $sum: '$grossAmountCents' },
          totalPlatformFees: { $sum: '$platformFeeCents' },
          totalOrgShare: { $sum: '$organisationShareCents' },
          totalTeacherShare: { $sum: '$teacherShareCents' },
        },
      },
    ]);

    const agg = purchaseAgg[0] || {
      totalGross: 0,
      totalPlatformFees: 0,
      totalOrgShare: 0,
      totalTeacherShare: 0,
    };

    // Recent purchases
    const recentPurchases = await this.purchaseModel
      .find({ status: { $in: ['paid', 'refunded'] } })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const courseIds = [
      ...new Set(recentPurchases.map((p) => String(p.courseId))),
    ];
    const courses = await this.courseModel
      .find({ _id: { $in: courseIds.map((id) => new Types.ObjectId(id)) } })
      .lean();
    const courseMap = new Map(courses.map((c) => [String(c._id), c]));

    const items = recentPurchases.map((p) => ({
      purchase_id: String(p._id),
      course_name:
        courseMap.get(String(p.courseId))?.course_name || 'Unknown',
      gross_amount: p.grossAmountCents / 100,
      platform_fee: p.platformFeeCents / 100,
      org_share: p.organisationShareCents / 100,
      teacher_share: p.teacherShareCents / 100,
      status: p.status,
      created_at: (p as any).createdAt,
    }));

    return {
      status: true,
      data: {
        summary: {
          total_purchases: totalPurchases,
          total_refunds: totalRefunds,
          total_gross_revenue: agg.totalGross / 100,
          total_platform_fees: agg.totalPlatformFees / 100,
          total_org_payouts: agg.totalOrgShare / 100,
          total_teacher_payouts: agg.totalTeacherShare / 100,
        },
        recent_purchases: items,
      },
    };
  }
}
