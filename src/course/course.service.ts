import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import { Course, CourseDocument } from './schemas/course.schema';
import { Lesson, LessonDocument } from './schemas/lesson.schema';
import { SubLesson, SubLessonDocument } from './schemas/sublesson.schema';
import { Review, ReviewDocument } from './schemas/review.schema';
import { Teacher, TeacherDocument } from '../teacher/schemas/teacher.schema';
import { User, UserDocument } from '../user/schemas/user.schema';
import {
  Category,
  CategoryDocument,
} from '../category/schemas/category.schema';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import {
  CourseProgress,
  CourseProgressDocument,
} from './schemas/course-progress.schema';
import { CommunicationService } from '../communication/communication.service';
import {
  CourseTranslation,
  CourseTranslationDocument,
} from './schemas/course-translation.schema';
import {
  LessonTranslation,
  LessonTranslationDocument,
} from './schemas/lesson-translation.schema';
import {
  SubLessonTranslation,
  SubLessonTranslationDocument,
} from './schemas/sublesson-translation.schema';
import { TranslationQueueService } from '../translation/translation-queue.service';
import { TranslationService } from '../translation/translation.service';
import {
  CreateStep1Dto,
  CreateStep2Dto,
  CreateStep3Dto,
  CreateFinalStepDto,
  UpdateStep1Dto,
  UpdateStep2Dto,
  UpdateStep3Dto,
  UpdateStep4Dto,
  UpdateStep5Dto,
  UpdateStep6Dto,
  UpdateCourseStatusDto,
  CreateLessonDto,
  UpdateLessonDto,
  CreateSubLessonDto,
  UpdateSubLessonDto,
} from './dto/course.dto';

@Injectable()
export class CourseService {
  private readonly logger = new Logger(CourseService.name);

  constructor(
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
    @InjectModel(Lesson.name) private lessonModel: Model<LessonDocument>,
    @InjectModel(SubLesson.name)
    private subLessonModel: Model<SubLessonDocument>,
    @InjectModel(Review.name) private reviewModel: Model<ReviewDocument>,
    @InjectModel(Teacher.name) private teacherModel: Model<TeacherDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
    @InjectModel(CourseProgress.name)
    private progressModel: Model<CourseProgressDocument>,
    private readonly cloudinary: CloudinaryService,
    @InjectConnection() private readonly connection: Connection,
    private readonly communicationService: CommunicationService,
    @InjectModel(CourseTranslation.name)
    private readonly courseTranslationModel: Model<CourseTranslationDocument>,
    @InjectModel(LessonTranslation.name)
    private readonly lessonTranslationModel: Model<LessonTranslationDocument>,
    @InjectModel(SubLessonTranslation.name)
    private readonly subLessonTranslationModel: Model<SubLessonTranslationDocument>,
    private readonly translationQueueService: TranslationQueueService,
    private readonly translationService: TranslationService,
  ) {}

  // ─── Helper: build flat course response ───────────────────────────────────
  private async buildCourseResponse(
    course: CourseDocument,
    userId?: string | null,
    locale = 'en',
  ) {
    let callingUser: any = null;
    if (userId) {
      callingUser = await this.userModel.findById(userId).lean();
    }

    // Look up translation if requested locale is Punjabi or French
    let translation: CourseTranslationDocument | null = null;
    if (locale && ['pa', 'fr'].includes(locale)) {
      translation = await this.courseTranslationModel.findOne({
        course_id: course._id,
        locale,
        status: { $in: ['completed', 'outdated'] },
      });
    }

    const courseName = translation?.course_name || course.course_name;
    const aboutCourse = translation?.about_course || course.about_course;
    const description = translation?.description || course.description;
    const overview = translation?.overview || course.overview;
    const learningPoints =
      translation?.learning_points && translation.learning_points.length > 0
        ? translation.learning_points
        : course.learning_points;
    const skillsYouGain =
      translation?.skills_you_gain && translation.skills_you_gain.length > 0
        ? translation.skills_you_gain
        : course.skills_you_gain;

    // Populate head teacher
    let headTeacher: TeacherDocument | null = null;
    if (course.head_teacher) {
      headTeacher = await this.teacherModel.findById(course.head_teacher);
    }

    // Populate instructor (meet-your-teacher)
    let instructor: TeacherDocument | null = null;
    if (course.instructor_id) {
      instructor = await this.teacherModel.findById(course.instructor_id);
    }

    // Populate category
    let category: CategoryDocument | null = null;
    if (course.category_id) {
      category = await this.categoryModel.findById(course.category_id);
    }

    // Populate related courses
    let relatedCoursesData: Record<string, unknown>[] = [];
    if (course.category_id) {
      const relatedDocs = await this.courseModel
        .find({
          category_id: course.category_id,
          course_status: 'published',
          _id: { $ne: course._id },
        })
        .limit(4)
        .lean();

      relatedCoursesData = await Promise.all(
        relatedDocs.map(async (c) => {
          let teacher: TeacherDocument | null = null;
          if (c.head_teacher) {
            teacher = await this.teacherModel.findById(c.head_teacher).lean();
          }

          let relCourseName = c.course_name;
          if (locale && ['pa', 'fr'].includes(locale)) {
            const relTrans = await this.courseTranslationModel
              .findOne({
                course_id: c._id,
                locale,
                status: { $in: ['completed', 'outdated'] },
              })
              .lean();
            if (relTrans?.course_name) {
              relCourseName = relTrans.course_name;
            }
          }

          return {
            course_id: c._id,
            course_name: relCourseName,
            course_image_url: c.course_image_url,
            course_status: c.course_status,
            course_type: c.course_type,
            course_price: c.course_price ?? 0,
            course_duration: c.duration,
            course_level: c.course_type,
            course_schedule: c.course_schedule,
            live_class: c.live_classes,
            enrolled_user_count: c.enrolled_user_count,
            average_rating: c.average_rating,
            category_id: c.category_id,
            category_name: category?.category_name ?? null,
            head_teacher_id: c.head_teacher,
            head_teacher_name: teacher
              ? `${(teacher as any).firstName || ''} ${(teacher as any).lastName || ''}`.trim()
              : null,
            head_teacher_image_url: (teacher as any)?.photo ?? null,
            created_at: (c as any).createdAt,
            batch: (c.batch || [])
              .filter((b) => {
                if (callingUser && String((callingUser as any).role) === 'teacher' && (callingUser as any).teacherId) {
                  return b.teacher === String((callingUser as any).teacherId);
                }
                return true;
              })
              .map((b) => ({
                _id: b._id,
                batchName: b.batchName,
                teacher: b.teacher ?? null,
              })),
          };
        }),
      );
    }

    const responseObj = {
      course_id: course._id,
      course_name: courseName,
      course_image_url: course.course_image_url,
      course_price: course.course_price ?? 0,
      teacher_revenue_percent: course.teacherRevenuePercent ?? 20,
      teacherRevenuePercent: course.teacherRevenuePercent ?? 20,
      course_type: course.course_type,
      course_duration: course.duration,
      total_weeks: (course as any).total_weeks || 4,
      course_level: course.course_type, // mapped for frontend compat
      course_schedule: course.course_schedule,
      course_status: course.course_status,
      demo_classes: course.demo_class,
      live_classes: course.live_classes,
      batch: Array.isArray(course.batch) 
        ? course.batch.filter((b) => {
            if (callingUser && String((callingUser as any).role) === 'teacher' && (callingUser as any).teacherId) {
              return b.teacher === String((callingUser as any).teacherId);
            }
            return true;
          })
        : course.batch,
      learning_points: learningPoints,
      course_learning_points: learningPoints, // alias used by CourseInfoDataProp
      skills_you_gain: skillsYouGain,
      about_course: aboutCourse,
      description: description,
      overview: overview,
      enrolled_user_count: course.enrolled_user_count,
      average_rating: course.average_rating,
      review_count: course.review_count,
      created_at: (course as unknown as { createdAt?: Date }).createdAt,
      // Translation metadata
      current_locale: locale,
      translation_status: translation
        ? translation.status
        : locale === 'en'
          ? 'original'
          : 'pending',
      translation_source: translation ? translation.source : 'original',
      // Category
      category_id: course.category_id,
      category_name: category?.category_name ?? null,
      // Head teacher
      head_teacher_id: course.head_teacher,
      head_teacher_name: headTeacher
        ? `${headTeacher.firstName} ${headTeacher.lastName}`
        : null,
      head_teacher_image_url: headTeacher?.photo ?? null,
      course_instructor: instructor
        ? `${instructor.firstName} ${instructor.lastName}`
        : null,
      instructor_id: course.instructor_id,
      course_instructor_image_url: instructor?.photo ?? null,
      // Stubs for Phase 4
      meet_your_teacher: instructor
        ? `${instructor.firstName} ${instructor.lastName}`
        : null,
      related_courses: relatedCoursesData,
      enrolled_status: false,
      favorite: false,
    };

    if (userId) {
      const isEnrolled = await this.connection
        .collection('batch_enrolled_students')
        .findOne({
          student_id: new Types.ObjectId(userId),
          course_id: new Types.ObjectId(String(course._id)),
        });
      if (isEnrolled) {
        responseObj.enrolled_status = true;
      }

      const isFavorite = await this.connection.collection('likes').findOne({
        student_id: new Types.ObjectId(userId),
        course_id: new Types.ObjectId(String(course._id)),
      });
      if (isFavorite) {
        responseObj.favorite = true;
      }
    }

    return responseObj;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CREATE STEPS
  // ─────────────────────────────────────────────────────────────────────────

  async createStep1(dto: CreateStep1Dto, userId: string) {
    const { course_id, ...fields } = dto;

    let orgId: Types.ObjectId | null = null;
    if (fields.organisation_id && Types.ObjectId.isValid(fields.organisation_id)) {
      orgId = new Types.ObjectId(fields.organisation_id);
    }

    let headTeacherId: Types.ObjectId | null = null;
    if (fields.head_teacher && Types.ObjectId.isValid(fields.head_teacher)) {
      headTeacherId = new Types.ObjectId(fields.head_teacher);
    }

    let categoryId: Types.ObjectId | null = null;
    if (fields.category_id) {
      if (Types.ObjectId.isValid(fields.category_id)) {
        categoryId = new Types.ObjectId(fields.category_id);
      } else {
        // Fallback: look up category by name
        const cat = await this.categoryModel.findOne({
          category_name: {
            $regex: new RegExp(`^${fields.category_id.trim()}$`, 'i'),
          },
        });
        if (cat) {
          categoryId = cat._id as Types.ObjectId;
        }
      }
    }

    // Build update payload
    const payload: Record<string, unknown> = {
      course_name: fields.course_name,
      ...(headTeacherId && { head_teacher: headTeacherId }),
      ...(fields.duration && { duration: fields.duration }),
      total_weeks:
        fields.total_weeks !== undefined && fields.total_weeks !== null
          ? Number(fields.total_weeks)
          : fields.duration === '1_week'
          ? 1
          : fields.duration === '2_weeks'
          ? 2
          : fields.duration === '3_weeks'
          ? 3
          : fields.duration === '4_weeks' || fields.duration === '1_month'
          ? 4
          : fields.duration === '6_weeks'
          ? 6
          : fields.duration === '8_weeks' || fields.duration === '2_months'
          ? 8
          : fields.duration === '12_weeks' || fields.duration === '3_months'
          ? 12
          : fields.duration === '16_weeks'
          ? 16
          : fields.duration === '24_weeks'
          ? 24
          : 4,
      ...(fields.course_type && { course_type: fields.course_type }),
      ...(fields.course_price !== undefined && {
        course_price: Number(fields.course_price),
      }),
      ...(fields.demo_class !== undefined && { demo_class: fields.demo_class }),
      ...(categoryId && { category_id: categoryId }),
      ...(fields.course_schedule && {
        course_schedule: fields.course_schedule,
      }),
      ...(fields.live_classes !== undefined && {
        live_classes: fields.live_classes,
      }),
      ...(fields.batch && { batch: fields.batch }),
      ...(orgId && { organisation_id: orgId }),
      ...(fields.teacher_revenue_percent !== undefined && {
        teacherRevenuePercent: Number(fields.teacher_revenue_percent),
      }),
    };

    let course: CourseDocument;
    const isUpsert = Boolean(course_id && Types.ObjectId.isValid(course_id));

    if (isUpsert) {
      // ── Upsert: user went back and resubmitted ──────────────────────────
      const existing = await this.courseModel.findById(course_id);
      if (existing) {
        if (payload.batch && existing.batch) {
          payload.batch = (payload.batch as any[]).map((newBatch) => {
            const existingBatch = existing.batch.find(
              (b) => b.batchName === newBatch.batchName,
            );
            if (existingBatch && existingBatch._id) {
              return { ...newBatch, _id: existingBatch._id };
            }
            return newBatch;
          });
        }

        course = (await this.courseModel.findByIdAndUpdate(
          course_id,
          { $set: payload },
          { new: true },
        )) as CourseDocument;
      } else {
        const user = await this.userModel.findById(userId).lean();
        if (!orgId && user?.organisationId) {
          orgId = new Types.ObjectId(String(user.organisationId));
        }

        course = await this.courseModel.create({
          ...payload,
          created_by: new Types.ObjectId(userId),
          organisation_id: orgId || null,
          course_status: 'draft',
        });
      }
    } else {
      // ── Create new draft ─────────────────────────────────────────────────
      const user = await this.userModel.findById(userId).lean();

      if (!orgId && user?.organisationId) {
        orgId = new Types.ObjectId(String(user.organisationId));
      }

      course = await this.courseModel.create({
        ...payload,
        created_by: new Types.ObjectId(userId),
        organisation_id: orgId || null,
        course_status: 'draft',
      });
    }

    return {
      status: true,
      message: course_id ? 'Course updated' : 'Course created as draft',
      data: { course_id: course._id },
    };
  }

  async createStep2(dto: CreateStep2Dto, file?: Express.Multer.File) {
    const course = await this.courseModel.findById(dto.course_id);
    if (!course) throw new NotFoundException('Course not found');

    let course_image_url = course.course_image_url;
    if (file) {
      const uploaded = await this.cloudinary.uploadFile(file, 'lms/courses');
      course_image_url = uploaded.secure_url;
    }

    const updated = await this.courseModel.findByIdAndUpdate(
      dto.course_id,
      {
        $set: {
          ...(course_image_url && { course_image_url }),
          ...(dto.learning_points && { learning_points: dto.learning_points }),
          ...(dto.skills_you_gain && { skills_you_gain: dto.skills_you_gain }),
        },
      },
      { new: true },
    );

    return {
      status: true,
      message: 'Step 2 saved',
      data: {
        course_id: updated?._id,
        course_image_url: updated?.course_image_url,
      },
    };
  }

  async createStep3(dto: CreateStep3Dto) {
    const course = await this.courseModel.findById(dto.course_id);
    if (!course) throw new NotFoundException('Course not found');

    await this.courseModel.findByIdAndUpdate(dto.course_id, {
      $set: {
        ...(dto.about_course !== undefined && {
          about_course: dto.about_course,
        }),
        ...(dto.instructor_id &&
          Types.ObjectId.isValid(dto.instructor_id) && {
            instructor_id: new Types.ObjectId(dto.instructor_id),
          }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });

    return {
      status: true,
      message: 'Step 3 saved',
      data: { course_id: dto.course_id },
    };
  }

  async createFinalStep(dto: CreateFinalStepDto) {
    const course = await this.courseModel.findById(dto.course_id);
    if (!course) throw new NotFoundException('Course not found');

    const status = dto.course_status === 'draft' ? 'draft' : 'published';

    await this.courseModel.findByIdAndUpdate(dto.course_id, {
      $set: {
        ...(dto.overview !== undefined && { overview: dto.overview }),
        course_status: status,
      },
    });

    // Asynchronously trigger automatic multilingual translation (Punjabi & French)
    this.translationQueueService
      .enqueueCourseTranslation(dto.course_id, ['pa', 'fr'])
      .catch((err) => {
        this.logger.error(
          `Failed to enqueue course translation for ${dto.course_id}: ${err.message}`,
        );
      });

    return {
      status: true,
      message:
        status === 'draft'
          ? 'Course saved as draft. You can publish it from the course detail page.'
          : 'Course Published successfully',
      data: { course_id: dto.course_id, course_status: status },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UPDATE STEPS (6-step edit flow)
  // ─────────────────────────────────────────────────────────────────────────

  async updateStep1(dto: UpdateStep1Dto, file?: Express.Multer.File) {
    const course = await this.courseModel.findById(dto.course_id);
    if (!course) throw new NotFoundException('Course not found');

    let course_image_url = course.course_image_url;
    if (file) {
      const uploaded = await this.cloudinary.uploadFile(file, 'lms/courses');
      course_image_url = uploaded.secure_url;
    }

    if (dto.batch && course.batch) {
      dto.batch = dto.batch.map((newBatch: any) => {
        const existingBatch = course.batch.find(b => b.batchName === newBatch.batchName);
        if (existingBatch && existingBatch._id) {
          return { ...newBatch, _id: existingBatch._id };
        }
        return newBatch;
      });
    }

    await this.courseModel.findByIdAndUpdate(dto.course_id, {
      $set: {
        ...(dto.course_name && { course_name: dto.course_name }),
        ...(dto.head_teacher && {
          head_teacher: new Types.ObjectId(dto.head_teacher),
        }),
        ...(dto.duration && { duration: dto.duration }),
        ...(dto.course_type && { course_type: dto.course_type }),
        ...(dto.course_price !== undefined && {
          course_price: Number(dto.course_price),
        }),
        ...(dto.demo_class !== undefined && { demo_class: dto.demo_class }),
        ...(dto.category_id && {
          category_id: new Types.ObjectId(dto.category_id),
        }),
        ...(dto.course_schedule && { course_schedule: dto.course_schedule }),
        ...(dto.live_classes !== undefined && {
          live_classes: dto.live_classes,
        }),
        ...(dto.batch && { batch: dto.batch }),
        ...(dto.organisation_id && {
          organisation_id: new Types.ObjectId(dto.organisation_id),
        }),
        ...(dto.teacher_revenue_percent !== undefined && {
          teacherRevenuePercent: Number(dto.teacher_revenue_percent),
        }),
        ...(course_image_url && { course_image_url }),
      },
    });

    if (dto.course_name) {
      this.translationService.onCourseUpdated(dto.course_id).catch((err) => {
        this.logger.error(`Error updating translation on step 1: ${err.message}`);
      });
    }

    return {
      status: true,
      message: 'Course info updated',
      data: { course_id: dto.course_id },
    };
  }

  async updateStep2(dto: UpdateStep2Dto) {
    await this.guardCourse(dto.course_id);
    await this.courseModel.findByIdAndUpdate(dto.course_id, {
      $set: { learning_points: dto.learning_points ?? [] },
    });
    this.translationService.onCourseUpdated(dto.course_id).catch((err) => {
      this.logger.error(`Error updating translation on step 2: ${err.message}`);
    });

    return {
      status: true,
      message: 'Learning points updated',
      data: { course_id: dto.course_id },
    };
  }

  async updateStep3(dto: UpdateStep3Dto) {
    await this.guardCourse(dto.course_id);
    await this.courseModel.findByIdAndUpdate(dto.course_id, {
      $set: {
        skills_you_gain: dto.skills_you_gain ?? [],
        ...(dto.category_id && {
          category_id: new Types.ObjectId(dto.category_id),
        }),
      },
    });
    this.translationService.onCourseUpdated(dto.course_id).catch((err) => {
      this.logger.error(`Error updating translation on step 3: ${err.message}`);
    });

    return {
      status: true,
      message: 'Skills updated',
      data: { course_id: dto.course_id },
    };
  }

  async updateStep4(dto: UpdateStep4Dto) {
    await this.guardCourse(dto.course_id);
    await this.courseModel.findByIdAndUpdate(dto.course_id, {
      $set: { about_course: dto.about_course },
    });
    this.translationService.onCourseUpdated(dto.course_id).catch((err) => {
      this.logger.error(`Error updating translation on step 4: ${err.message}`);
    });

    return {
      status: true,
      message: 'About updated',
      data: { course_id: dto.course_id },
    };
  }

  async updateStep5(dto: UpdateStep5Dto) {
    await this.guardCourse(dto.course_id);
    await this.courseModel.findByIdAndUpdate(dto.course_id, {
      $set: {
        ...(dto.instructor_id &&
          Types.ObjectId.isValid(dto.instructor_id) && {
            instructor_id: new Types.ObjectId(dto.instructor_id),
          }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });
    if (dto.description !== undefined) {
      this.translationService.onCourseUpdated(dto.course_id).catch((err) => {
        this.logger.error(`Error updating translation on step 5: ${err.message}`);
      });
    }

    return {
      status: true,
      message: 'Teacher info updated',
      data: { course_id: dto.course_id },
    };
  }

  async updateStep6(dto: UpdateStep6Dto) {
    await this.guardCourse(dto.course_id);
    await this.courseModel.findByIdAndUpdate(dto.course_id, {
      $set: { overview: dto.overview },
    });
    this.translationService.onCourseUpdated(dto.course_id).catch((err) => {
      this.logger.error(`Error updating translation on step 6: ${err.message}`);
    });

    return {
      status: true,
      message: 'Overview updated',
      data: { course_id: dto.course_id },
    };
  }

  async updateCourseStatus(dto: UpdateCourseStatusDto) {
    const course = await this.guardCourse(dto.course_id);
    const updatePayload: Record<string, unknown> = {
      course_status: dto.status,
    };
    if (dto.course_name) updatePayload.course_name = dto.course_name;
    if (dto.description !== undefined)
      updatePayload.description = dto.description;

    await this.courseModel.findByIdAndUpdate(dto.course_id, {
      $set: updatePayload,
    });

    if (dto.status === 'published') {
      this.translationQueueService
        .enqueueCourseTranslation(dto.course_id, ['pa', 'fr'])
        .catch((err) => {
          this.logger.error(
            `Failed to enqueue course translation on publish: ${err.message}`,
          );
        });
    } else if (dto.course_name || dto.description !== undefined) {
      this.translationService.onCourseUpdated(dto.course_id).catch((err) => {
        this.logger.error(`Error updating translation on course status change: ${err.message}`);
      });
    }

    return {
      status: true,
      message: `Course ${dto.status}`,
      data: { course_id: dto.course_id, course_status: dto.status },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LISTING & DETAILS
  // ─────────────────────────────────────────────────────────────────────────

  async getAllCourses(
    query: {
      page?: string;
      size?: string;
      search?: string;
      category_id?: string;
      status?: string;
      course_type?: string;
      course_schedule?: string;
      live_classes?: string;
      organisation_id?: string;
    },
    userId: string | null,
    locale = 'en',
  ) {
    const page = Math.max(1, parseInt(query.page || '1'));
    const size = Math.min(50, Math.max(1, parseInt(query.size || '10')));
    const skip = (page - 1) * size;

    const andFilters: Record<string, unknown>[] = [];

    if (query.organisation_id) {
      andFilters.push({
        organisation_id: new Types.ObjectId(query.organisation_id),
      });
    }

    // ─── Smart Data Isolation for Instructors & Teachers ─────────────────
    const callingUser = userId ? await this.userModel.findById(userId).lean() : null;
    if (
      callingUser &&
      String(callingUser.role) === 'instructor' &&
      callingUser.organisationId &&
      !query.organisation_id
    ) {
      andFilters.push({
        organisation_id: new Types.ObjectId(String(callingUser.organisationId)),
      });
    }

    if (
      callingUser &&
      String(callingUser.role) === 'teacher' &&
      callingUser.teacherId
    ) {
      andFilters.push({
        $or: [
          { instructor_id: new Types.ObjectId(String(callingUser.teacherId)) },
          { head_teacher: new Types.ObjectId(String(callingUser.teacherId)) },
          { 'batch.teacher': String(callingUser.teacherId) },
        ],
      });
    }

    if (query.search) {
      andFilters.push({ course_name: { $regex: query.search, $options: 'i' } });
    }

    if (query.category_id) {
      andFilters.push({ category_id: new Types.ObjectId(query.category_id) });
    }

    if (query.status) {
      andFilters.push({ course_status: query.status });
    }

    if (query.course_type) {
      andFilters.push({ course_type: query.course_type });
    }

    if (query.course_schedule) {
      andFilters.push({ course_schedule: query.course_schedule });
    }

    if (query.live_classes !== undefined) {
      andFilters.push({ live_classes: query.live_classes === 'true' });
    }

    const filter = andFilters.length > 0 ? { $and: andFilters } : {};

    const [courses, total] = await Promise.all([
      this.courseModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(size)
        .lean(),
      this.courseModel.countDocuments(filter),
    ]);

    // Check user enrollments
    const enrolledCourseIds = new Set<string>();
    if (callingUser) {
      const enrollments = await this.connection.collection('batch_enrolled_students').find({ student_id: new Types.ObjectId(callingUser._id) }).toArray();
      for (const e of enrollments) {
        enrolledCourseIds.add(e.course_id.toString());
      }
    }

    // Pre-fetch translations for requested locale if Punjabi or French
    const translationMap = new Map<string, string>();
    if (locale && ['pa', 'fr'].includes(locale)) {
      const courseIds = courses.map((c) => c._id);
      const transDocs = await this.courseTranslationModel
        .find({
          course_id: { $in: courseIds },
          locale,
          status: { $in: ['completed', 'outdated'] },
        })
        .lean();
      for (const td of transDocs) {
        if (td.course_name) {
          translationMap.set(td.course_id.toString(), td.course_name);
        }
      }
    }

    // Build list items with populated fields
    const course_list = await Promise.all(
      courses.map(async (c) => {
        const headTeacher = c.head_teacher
          ? await this.teacherModel.findById(c.head_teacher).lean()
          : null;
        const category = c.category_id
          ? await this.categoryModel.findById(c.category_id).lean()
          : null;

        const enrolled_user_count = await this.connection.collection('batch_enrolled_students').countDocuments({
          course_id: new Types.ObjectId(c._id.toString()),
        });

        const localizedCourseName =
          translationMap.get(c._id.toString()) || c.course_name;

        return {
          course_id: c._id,
          course_name: localizedCourseName,
          course_image_url: c.course_image_url,
          course_status: c.course_status,
          course_type: c.course_type,
          course_price: c.course_price ?? 0,
          teacher_revenue_percent: c.teacherRevenuePercent ?? 20,
          teacherRevenuePercent: c.teacherRevenuePercent ?? 20,
          course_duration: c.duration,
          course_level: c.course_type,
          course_schedule: c.course_schedule,
          live_class: c.live_classes,
          enrolled_user_count: enrolled_user_count || c.enrolled_user_count,
          average_rating: c.average_rating,
          category_id: c.category_id,
          category_name: category?.category_name ?? null,
          head_teacher_id: c.head_teacher,
          head_teacher_name: headTeacher
            ? `${(headTeacher as unknown as { firstName?: string; lastName?: string }).firstName || ''} ${(headTeacher as unknown as { firstName?: string; lastName?: string }).lastName || ''}`.trim()
            : null,
          head_teacher_image_url:
            (headTeacher as unknown as { photo?: string })?.photo ?? null,
          created_at: (c as unknown as { createdAt: Date }).createdAt,
          enrolled_status: enrolledCourseIds.has(c._id.toString()),
          batch: (c.batch || [])
            .filter((b) => {
              if (callingUser && String(callingUser.role) === 'teacher' && callingUser.teacherId) {
                const isHeadOrInstructor =
                  String(c.head_teacher) === String(callingUser.teacherId) ||
                  String(c.instructor_id) === String(callingUser.teacherId);
                if (isHeadOrInstructor) return true;
                return String(b.teacher) === String(callingUser.teacherId);
              }
              return true;
            })
            .map((b) => ({
              _id: b._id,
              batchName: b.batchName,
              teacher: b.teacher ?? null,
            })),
        };
      }),
    );

    return {
      status: true,
      data: { course_list, total_courses: total, page, size },
    };
  }

  async getCourseDetails(
    courseId: string,
    userId?: string | null,
    locale = 'en',
  ) {
    const course = await this.courseModel.findById(courseId);
    if (!course) throw new NotFoundException('Course not found');

    const detail = await this.buildCourseResponse(course, userId, locale);
    return { status: true, data: detail };
  }

  async getInstructorDashboardStats(userId: string) {
    const user = await this.userModel.findById(userId).lean();
    if (!user) throw new NotFoundException('User not found');

    const courseFilter: Record<string, unknown> = {};
    if (user.role === 'instructor') {
      courseFilter.$or = [
        { created_by: new Types.ObjectId(userId) },
        ...(user.organisationId
          ? [{ organisation_id: user.organisationId }]
          : []),
      ];
    } else if (user.role === 'teacher' && user.teacherId) {
      courseFilter.$or = [
        { head_teacher: user.teacherId },
        { 'batch.teacher': String(user.teacherId) },
      ];
    }

    const courses = await this.courseModel.find(courseFilter).select('_id batch').lean();
    const courseIds = courses.map((c) => c._id);
    const batchIds = courses.flatMap((c) =>
      (c.batch || []).map((b: { _id?: Types.ObjectId }) => b._id).filter(Boolean),
    );

    const [studentCount, pendingAssignments] = await Promise.all([
      this.connection.collection('batch_enrolled_students').countDocuments({
        course_id: { $in: courseIds },
      }),
      this.connection.collection('assignment_submissions').countDocuments({
        status: 'Submitted',
      }),
    ]);

    const upcomingLive = await this.connection.collection('schedules').countDocuments({
      courseId: { $in: courseIds },
      date: { $gte: new Date() },
      meetingLink: { $ne: '' },
    });

    return {
      status: true,
      data: {
        courseCount: courses.length,
        studentCount,
        upcomingLiveClasses: upcomingLive,
        pendingAssignmentsToGrade: pendingAssignments,
        batchCount: batchIds.length,
      },
    };
  }

  async searchCourses(q: string) {
    const courses = await this.courseModel
      .find({
        course_status: 'published',
        $or: [{ course_name: { $regex: q, $options: 'i' } }],
      })
      .limit(20)
      .lean();

    const results = await Promise.all(
      courses.map(async (c) => {
        const category = c.category_id
          ? await this.categoryModel.findById(c.category_id).lean()
          : null;
        return {
          course_id: c._id,
          course_name: c.course_name,
          course_image_url: c.course_image_url,
          category_name: category?.category_name ?? null,
          course_status: c.course_status,
          course_price: c.course_price,
        };
      }),
    );

    return { status: true, data: results };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LESSON CRUD
  // ─────────────────────────────────────────────────────────────────────────

  async createLesson(dto: CreateLessonDto, files?: Express.Multer.File[]) {
    await this.guardCourse(dto.course_id);

    const studyMaterials: { file_url: string; file_name: string; file_type: string }[] = [];
    if (files && files.length > 0) {
      for (const file of files) {
        const uploaded = await this.cloudinary.uploadFile(file, 'lms/lessons');
        studyMaterials.push({
          file_url: uploaded.secure_url,
          file_name: file.originalname,
          file_type: file.mimetype.startsWith('video') ? 'video' : 'pdf',
        });
      }
    }

    const lesson = await this.lessonModel.create({
      course_id: new Types.ObjectId(dto.course_id),
      lesson_name: dto.lesson_name,
      lesson_description: dto.description ?? null,
      unlock_after_previous: dto.unlock_after_previous ?? false,
      week: dto.week !== undefined && dto.week !== null ? Number(dto.week) : 1,
      studyMaterials,
      uploaded_at: new Date(),
    });

    return {
      status: true,
      message: 'Lesson created',
      data: { lesson_id: lesson._id },
    };
  }

  async updateLesson(dto: UpdateLessonDto, files?: Express.Multer.File[]) {
    const lesson = await this.lessonModel.findById(dto.lesson_id);
    if (!lesson) throw new NotFoundException('Lesson not found');

    // Clean up removed files from Cloudinary
    if (dto.existing_files && lesson.studyMaterials && lesson.studyMaterials.length > 0) {
      const retainedUrls = new Set(dto.existing_files.map((f) => f.file_url));
      for (const mat of lesson.studyMaterials) {
        if (mat.file_url && !retainedUrls.has(mat.file_url)) {
          this.cloudinary.deleteByUrl(mat.file_url);
        }
      }
    }

    const studyMaterials = dto.existing_files ? [...dto.existing_files] : (lesson.studyMaterials ? [...lesson.studyMaterials] : []);

    if (files && files.length > 0) {
      for (const file of files) {
        const uploaded = await this.cloudinary.uploadFile(file, 'lms/lessons');
        studyMaterials.push({
          file_url: uploaded.secure_url,
          file_name: file.originalname,
          file_type: file.mimetype.startsWith('video') ? 'video' : 'pdf',
        });
      }
    }

    await this.lessonModel.findByIdAndUpdate(dto.lesson_id, {
      $set: {
        ...(dto.lesson_name && { lesson_name: dto.lesson_name }),
        ...(dto.description !== undefined && {
          lesson_description: dto.description,
        }),
        ...(dto.unlock_after_previous !== undefined && {
          unlock_after_previous: dto.unlock_after_previous,
        }),
        ...(dto.week !== undefined && dto.week !== null && {
          week: Number(dto.week),
        }),
        studyMaterials,
      },
    });

    return {
      status: true,
      message: 'Lesson updated',
      data: { lesson_id: dto.lesson_id },
    };
  }

  async deleteLesson(lessonId: string) {
    const lesson = await this.lessonModel.findById(lessonId);
    if (!lesson) throw new NotFoundException('Lesson not found');

    // Clean up lesson study materials from Cloudinary
    if (lesson.studyMaterials && lesson.studyMaterials.length > 0) {
      for (const mat of lesson.studyMaterials) {
        if (mat.file_url) this.cloudinary.deleteByUrl(mat.file_url);
      }
    }

    // Cascade delete sublessons and clean up their files
    const sublessons = await this.subLessonModel.find({
      lesson_id: new Types.ObjectId(lessonId),
    });
    for (const sub of sublessons) {
      if (sub.studyMaterials && sub.studyMaterials.length > 0) {
        for (const mat of sub.studyMaterials) {
          if (mat.file_url) this.cloudinary.deleteByUrl(mat.file_url);
        }
      }
    }

    await this.lessonModel.findByIdAndDelete(lessonId);
    await this.subLessonModel.deleteMany({
      lesson_id: new Types.ObjectId(lessonId),
    });

    return { status: true, message: 'Lesson deleted' };
  }

  async getLessonsWithSublessons(courseId: string, locale = 'en') {
    const course = await this.courseModel.findById(courseId).lean();
    let overview = course ? course.overview : '';

    const lessons = await this.lessonModel
      .find({ course_id: new Types.ObjectId(courseId) })
      .sort({ order: 1, createdAt: 1 })
      .lean();

    const lessonIds = lessons.map(
      (l) => (l as unknown as { _id: Types.ObjectId })._id,
    );
    const sublessons = await this.subLessonModel
      .find({ lesson_id: { $in: lessonIds } })
      .sort({ order: 1, createdAt: 1 })
      .lean();

    const lessonTransMap = new Map<string, { name?: string; desc?: string }>();
    const sublessonTransMap = new Map<
      string,
      { name?: string; desc?: string }
    >();

    if (locale && ['pa', 'fr'].includes(locale)) {
      const [cTrans, lTrans, sTrans] = await Promise.all([
        this.courseTranslationModel
          .findOne({
            course_id: new Types.ObjectId(courseId),
            locale,
            status: { $in: ['completed', 'outdated'] },
          })
          .lean(),
        this.lessonTranslationModel
          .find({
            course_id: new Types.ObjectId(courseId),
            locale,
            status: { $in: ['completed', 'outdated'] },
          })
          .lean(),
        this.subLessonTranslationModel
          .find({
            course_id: new Types.ObjectId(courseId),
            locale,
            status: { $in: ['completed', 'outdated'] },
          })
          .lean(),
      ]);

      if (cTrans?.overview) overview = cTrans.overview;
      for (const lt of lTrans) {
        lessonTransMap.set(lt.lesson_id.toString(), {
          name: lt.lesson_name,
          desc: lt.lesson_description || undefined,
        });
      }
      for (const st of sTrans) {
        sublessonTransMap.set(st.sublesson_id.toString(), {
          name: st.sublesson_name,
          desc: st.sublesson_description || undefined,
        });
      }
    }

    const lessonData = lessons.map((l) => {
      const transL = lessonTransMap.get(String((l as any)._id));
      return {
        lesson_id: (l as unknown as { _id: Types.ObjectId })._id,
        lesson_name: transL?.name || l.lesson_name,
        lesson_description:
          transL?.desc !== undefined ? transL.desc : l.lesson_description,
        studyMaterials: l.studyMaterials || [],
        unlock_after_previous: l.unlock_after_previous,
        week: (l as any).week || 1,
        order: (l as any).order || 0,
        uploaded_at: l.uploaded_at,
        sublessons: sublessons
          .filter(
            (s) =>
              String(s.lesson_id) ===
              String((l as unknown as { _id: Types.ObjectId })._id),
          )
          .map((s) => {
            const transS = sublessonTransMap.get(String((s as any)._id));
            return {
              sublesson_id: (s as unknown as { _id: Types.ObjectId })._id,
              sublesson_name: transS?.name || s.sublesson_name,
              sublesson_description:
                transS?.desc !== undefined
                  ? transS.desc
                  : s.sublesson_description,
              studyMaterials: s.studyMaterials || [],
              duration: s.duration,
              uploaded_at: s.uploaded_at,
            };
          }),
      };
    });

    return {
      status: true,
      data: {
        total_weeks: course ? (course as any).total_weeks || 4 : 4,
        overview,
        lessons: lessonData,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUBLESSON CRUD
  // ─────────────────────────────────────────────────────────────────────────

  async createSubLesson(dto: CreateSubLessonDto, files?: Express.Multer.File[]) {
    await this.guardCourse(dto.course_id);
    const lesson = await this.lessonModel.findById(dto.lesson_id);
    if (!lesson) throw new NotFoundException('Lesson not found');

    const studyMaterials: { file_url: string; file_name: string; file_type: string }[] = [];
    if (files && files.length > 0) {
      for (const file of files) {
        const uploaded = await this.cloudinary.uploadFile(file, 'lms/sublessons');
        studyMaterials.push({
          file_url: uploaded.secure_url,
          file_name: file.originalname,
          file_type: file.mimetype.startsWith('video') ? 'video' : 'pdf',
        });
      }
    }

    const sub = await this.subLessonModel.create({
      course_id: new Types.ObjectId(dto.course_id),
      lesson_id: new Types.ObjectId(dto.lesson_id),
      sublesson_name: dto.Sublesson_name,
      sublesson_description: dto.description ?? null,
      studyMaterials,
      uploaded_at: new Date(),
    });

    return {
      status: true,
      message: 'Sub-lesson created',
      data: { sublesson_id: sub._id },
    };
  }

  async updateSubLesson(dto: UpdateSubLessonDto, files?: Express.Multer.File[]) {
    const sub = await this.subLessonModel.findById(dto.sublesson_id);
    if (!sub) throw new NotFoundException('Sub-lesson not found');

    // Clean up removed files from Cloudinary
    if (dto.existing_files && sub.studyMaterials && sub.studyMaterials.length > 0) {
      const retainedUrls = new Set(dto.existing_files.map((f) => f.file_url));
      for (const mat of sub.studyMaterials) {
        if (mat.file_url && !retainedUrls.has(mat.file_url)) {
          this.cloudinary.deleteByUrl(mat.file_url);
        }
      }
    }

    const studyMaterials = dto.existing_files ? [...dto.existing_files] : (sub.studyMaterials ? [...sub.studyMaterials] : []);

    if (files && files.length > 0) {
      for (const file of files) {
        const uploaded = await this.cloudinary.uploadFile(file, 'lms/sublessons');
        studyMaterials.push({
          file_url: uploaded.secure_url,
          file_name: file.originalname,
          file_type: file.mimetype.startsWith('video') ? 'video' : 'pdf',
        });
      }
    }

    await this.subLessonModel.findByIdAndUpdate(dto.sublesson_id, {
      $set: {
        ...(dto.Sublesson_name && { sublesson_name: dto.Sublesson_name }),
        ...(dto.description !== undefined && {
          sublesson_description: dto.description,
        }),
        studyMaterials,
      },
    });

    return {
      status: true,
      message: 'Sub-lesson updated',
      data: { sublesson_id: dto.sublesson_id },
    };
  }

  async deleteSubLesson(sublessonId: string) {
    const sub = await this.subLessonModel.findById(sublessonId);
    if (!sub) throw new NotFoundException('Sub-lesson not found');

    // Clean up sublesson files from Cloudinary
    if (sub.studyMaterials && sub.studyMaterials.length > 0) {
      for (const mat of sub.studyMaterials) {
        if (mat.file_url) this.cloudinary.deleteByUrl(mat.file_url);
      }
    }

    await this.subLessonModel.findByIdAndDelete(sublessonId);
    return { status: true, message: 'Sub-lesson deleted' };
  }

  async reorderLessons(courseId: string, orders: { lesson_id: string; order: number }[]) {
    if (!orders || !Array.isArray(orders)) return { status: true };
    const bulkOps = orders
      .filter((item) => item.lesson_id && Types.ObjectId.isValid(item.lesson_id))
      .map((item) => ({
        updateOne: {
          filter: { _id: new Types.ObjectId(item.lesson_id) },
          update: { $set: { order: item.order } },
        },
      }));
    if (bulkOps.length > 0) {
      await this.lessonModel.bulkWrite(bulkOps);
    }
    return { status: true, message: 'Lessons reordered successfully' };
  }

  async reorderSublessons(lessonId: string, orders: { sublesson_id: string; order: number }[]) {
    if (!orders || !Array.isArray(orders)) return { status: true };
    const bulkOps = orders
      .filter((item) => item.sublesson_id && Types.ObjectId.isValid(item.sublesson_id))
      .map((item) => ({
        updateOne: {
          filter: { _id: new Types.ObjectId(item.sublesson_id) },
          update: { $set: { order: item.order } },
        },
      }));
    if (bulkOps.length > 0) {
      await this.subLessonModel.bulkWrite(bulkOps);
    }
    return { status: true, message: 'Sub-topics reordered successfully' };
  }

  async deleteCourse(courseId: string) {
    if (!Types.ObjectId.isValid(courseId)) {
      throw new BadRequestException('Invalid course ID');
    }
    const course = await this.courseModel.findByIdAndDelete(courseId);
    if (!course) throw new NotFoundException('Course not found');

    // Cascade delete all lessons and sublessons for this course
    await this.lessonModel.deleteMany({
      course_id: new Types.ObjectId(courseId),
    });
    await this.subLessonModel.deleteMany({
      course_id: new Types.ObjectId(courseId),
    });

    return { status: true, message: 'Course deleted successfully' };
  }

  async createBatch(dto: {
    course_id: string;
    batchName: string;
    teacher: string | null;
  }) {
    const course = await this.guardCourse(dto.course_id);
    const newBatch = {
      _id: new Types.ObjectId(),
      batchName: dto.batchName,
      teacher: dto.teacher,
    };
    course.batch.push(newBatch);
    await course.save();

    // Sync standalone batches collection
    await this.connection.collection('batches').updateOne(
      { _id: newBatch._id },
      {
        $set: {
          name: dto.batchName,
          batchName: dto.batchName,
          course_id: new Types.ObjectId(dto.course_id),
          teacher_id: dto.teacher ? new Types.ObjectId(dto.teacher) : null,
          organisation_id: course.organisation_id || null,
          chat_group_id: null,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );

    // Auto-create chat group for batch
    const chatGroup = await this.communicationService.ensureGroupForBatch(
      dto.course_id,
      String(newBatch._id),
      `${course.course_name || 'Course'} — ${dto.batchName}`,
      course.created_by ? [String(course.created_by)] : [],
    );
    if (chatGroup) {
      await this.connection.collection('batches').updateOne(
        { _id: newBatch._id },
        { $set: { chat_group_id: chatGroup._id } },
      );
    }

    return {
      status: true,
      message: 'Batch created successfully',
      data: newBatch,
    };
  }

  async updateBatch(dto: {
    course_id: string;
    batch_id: string;
    batchName: string;
    teacher: string | null;
  }) {
    const course = await this.guardCourse(dto.course_id);
    const batchIndex = course.batch.findIndex(
      (b) => b._id?.toString() === dto.batch_id,
    );
    if (batchIndex === -1) throw new NotFoundException('Batch not found');

    course.batch[batchIndex].batchName = dto.batchName;
    course.batch[batchIndex].teacher = dto.teacher;
    course.markModified('batch');
    await course.save();

    await this.connection.collection('batches').updateOne(
      { _id: new Types.ObjectId(dto.batch_id) },
      {
        $set: {
          name: dto.batchName,
          batchName: dto.batchName,
          teacher_id: dto.teacher ? new Types.ObjectId(dto.teacher) : null,
          organisation_id: course.organisation_id || null,
          course_id: new Types.ObjectId(dto.course_id),
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );

    return {
      status: true,
      message: 'Batch updated successfully',
      data: course.batch[batchIndex],
    };
  }

  async deleteBatch(courseId: string, batchId: string) {
    const course = await this.guardCourse(courseId);
    course.batch = course.batch.filter((b) => b._id?.toString() !== batchId);
    course.markModified('batch');
    await course.save();

    await this.connection
      .collection('batches')
      .deleteOne({ _id: new Types.ObjectId(batchId) });

    return { status: true, message: 'Batch deleted successfully' };
  }

  // ─── Guard helper ─────────────────────────────────────────────────────────
  private async guardCourse(
    courseId: string,
    userId?: string,
  ): Promise<CourseDocument> {
    const course = await this.courseModel.findById(courseId);
    if (!course) throw new NotFoundException('Course not found');
    if (userId) {
      const user = await this.userModel.findById(userId).lean();
      if (
        user &&
        String(user.role) === 'instructor' &&
        course.created_by &&
        String(course.created_by) !== String(userId) &&
        course.organisation_id &&
        user.organisationId &&
        String(course.organisation_id) !== String(user.organisationId)
      ) {
        throw new ForbiddenException('Not authorized for this course');
      }
    }
    return course;
  }

  async getStudentsList(
    userId: string,
    courseId?: string,
    batchId?: string,
    search?: string,
  ) {
    const callingUser = await this.userModel.findById(userId).lean();
    if (!callingUser) {
      throw new NotFoundException('Calling user not found');
    }

    const queryFilter: Record<string, unknown> = {
      role: 'student',
    };

    // If caller is a teacher, restrict viewable batches/students
    if (callingUser.role === 'teacher') {
      if (!callingUser.teacherId) {
        return { status: true, data: [] };
      }

      // Find all courses where teacher is head teacher, instructor, or batch teacher
      const courses = await this.courseModel
        .find({
          organisation_id: callingUser.organisationId,
          $or: [
            { head_teacher: new Types.ObjectId(String(callingUser.teacherId)) },
            {
              instructor_id: new Types.ObjectId(String(callingUser.teacherId)),
            },
            { 'batch.teacher': String(callingUser.teacherId) },
          ],
        })
        .lean();

      const allowedBatchIdsSet = new Set<string>();
      courses.forEach((c) => {
        const isHead =
          (c.head_teacher &&
            String(c.head_teacher) === String(callingUser.teacherId)) ||
          (c.instructor_id &&
            String(c.instructor_id) === String(callingUser.teacherId));

        (c.batch || []).forEach((b) => {
          if (
            isHead ||
            (b.teacher && String(b.teacher) === String(callingUser.teacherId))
          ) {
            allowedBatchIdsSet.add(String(b._id));
          }
        });
      });

      const allowedBatchIds = Array.from(allowedBatchIdsSet).map(
        (id) => new Types.ObjectId(id),
      );

      if (allowedBatchIds.length === 0) {
        return { status: true, data: [] };
      }

      let targetBatchIds: Types.ObjectId[] | null = null;
      if (batchId) {
        if (!allowedBatchIdsSet.has(batchId)) {
          throw new ForbiddenException('You do not have access to this batch');
        }
        targetBatchIds = [new Types.ObjectId(batchId)];
      } else if (courseId) {
        const course = courses.find((c) => String(c._id) === courseId);
        if (!course) {
          throw new ForbiddenException('You do not have access to this course');
        }
        const isHead =
          (course.head_teacher &&
            String(course.head_teacher) === String(callingUser.teacherId)) ||
          (course.instructor_id &&
            String(course.instructor_id) === String(callingUser.teacherId));

        const courseBatchIds = (course.batch || [])
          .filter(
            (b) =>
              isHead ||
              (b.teacher &&
                String(b.teacher) === String(callingUser.teacherId)),
          )
          .map((b) => new Types.ObjectId(b._id));

        if (courseBatchIds.length === 0) {
          return { status: true, data: [] };
        }
        targetBatchIds = courseBatchIds;
      } else {
        targetBatchIds = allowedBatchIds;
      }
      
      if (targetBatchIds) {
        const enrollments = await this.connection.collection('batch_enrolled_students').find({
          batch_id: { $in: targetBatchIds }
        }).toArray();
        queryFilter._id = { $in: enrollments.map(e => e.student_id) };
      }
    } else {
      // For administrators/instructors
      let targetBatchIds: Types.ObjectId[] = [];
      if (batchId) {
        targetBatchIds = [new Types.ObjectId(batchId)];
      } else if (courseId) {
        const course = await this.courseModel.findById(courseId).lean();
        if (course && course.batch && course.batch.length > 0) {
          targetBatchIds = course.batch.map((b) => new Types.ObjectId(b._id));
        } else {
          return { status: true, data: [] };
        }
      } else {
        const courses = await this.courseModel.find({ organisation_id: callingUser.organisationId }).lean();
        courses.forEach((c) => {
          (c.batch || []).forEach((b) => targetBatchIds.push(new Types.ObjectId(b._id)));
        });
        if (targetBatchIds.length === 0) {
          return { status: true, data: [] };
        }
      }
      
      const enrollments = await this.connection.collection('batch_enrolled_students').find({
        batch_id: { $in: targetBatchIds }
      }).toArray();
      queryFilter._id = { $in: enrollments.map(e => e.student_id) };
    }

    if (search) {
      queryFilter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const students = await this.userModel.find(queryFilter).lean();

    const studentObjectIds = students.map((s: any) => s._id);
    const allEnrollments = await this.connection.collection('batch_enrolled_students').find({
      student_id: { $in: studentObjectIds }
    }).toArray();

    const courseIdsToFetch = Array.from(new Set(allEnrollments.map(e => String(e.course_id))));
    const coursesForNames = await this.courseModel.find({ _id: { $in: courseIdsToFetch } }).lean();

    const formattedStudents = students.map((student: unknown) => {
      const s = student as any;
      const studentEnrollments = allEnrollments.filter(e => String(e.student_id) === String(s._id));
      
      const sBatchIds = studentEnrollments.map(e => String(e.batch_id));
      
      const uniqueBatchIds = Array.from(new Set([
        ...(s.batchIds ? s.batchIds.map(String) : []),
        ...sBatchIds
      ]));

      let displayEnrollment = studentEnrollments.find(e => 
        (courseId ? String(e.course_id) === String(courseId) : true) &&
        (batchId ? String(e.batch_id) === String(batchId) : true)
      ) || studentEnrollments[0];

      let courseName = "N/A";
      let batchName = "N/A";

      if (displayEnrollment) {
        const c = coursesForNames.find(c => String(c._id) === String(displayEnrollment.course_id));
        if (c) {
          courseName = c.course_name || "N/A";
          const b = (c.batch || []).find((b: any) => String(b._id) === String(displayEnrollment.batch_id));
          if (b) {
            batchName = b.batchName || "N/A";
          }
        }
      }

      return {
        student_id: String(s._id),
        name: `${s.firstName} ${s.lastName}`,
        email: s.email,
        avatar: s.profileImg || null,
        phone: s.phone || '',
        batchIds: uniqueBatchIds,
        courseName,
        batchName
      };
    });

    return { status: true, data: formattedStudents };
  }

  private async checkTeacherStudentAccess(
    callingUser: {
      role?: string;
      teacherId?: string | Types.ObjectId;
      organisationId?: Types.ObjectId;
    },
    student: { batchIds?: Types.ObjectId[] },
  ): Promise<string[]> {
    const studentBatchIds = student.batchIds ? student.batchIds.map(String) : [];
    
    if (callingUser.role === 'teacher') {
      if (!callingUser.teacherId) {
        throw new ForbiddenException('Teacher ID not linked');
      }

      // Find all courses where teacher is head teacher, instructor, or batch teacher
      const courses = await this.courseModel
        .find({
          organisation_id: callingUser.organisationId,
          $or: [
            { head_teacher: new Types.ObjectId(String(callingUser.teacherId)) },
            { instructor_id: new Types.ObjectId(String(callingUser.teacherId)) },
            { 'batch.teacher': String(callingUser.teacherId) },
          ],
        })
        .lean();

      const allowedBatchIdsSet = new Set<string>();
      courses.forEach((c) => {
        const isHead =
          (c.head_teacher && String(c.head_teacher) === String(callingUser.teacherId)) ||
          (c.instructor_id && String(c.instructor_id) === String(callingUser.teacherId));

        (c.batch || []).forEach((b) => {
          if (isHead || (b.teacher && String(b.teacher) === String(callingUser.teacherId))) {
            allowedBatchIdsSet.add(String(b._id));
          }
        });
      });

      const intersectingBatches = studentBatchIds.filter((id) => allowedBatchIdsSet.has(id));
      if (intersectingBatches.length === 0) {
        throw new ForbiddenException('You do not have permission to access this student');
      }
      return intersectingBatches;
    }

    // If not a teacher (e.g. instructor or admin), they have access to all student's batches
    return studentBatchIds;
  }

  async getStudentDetails(userId: string, studentId: string) {
    const callingUser = await this.userModel.findById(userId).lean();
    if (!callingUser) throw new NotFoundException('Calling user not found');

    const student = await this.userModel.findById(studentId).lean();
    if (!student) throw new NotFoundException('Student not found');

    const enrollments = await this.connection.collection('batch_enrolled_students').find({
      student_id: new Types.ObjectId(studentId)
    }).toArray();
    
    const allStudentBatchIdsSet = new Set([
      ...(student.batchIds ? student.batchIds.map(String) : []),
      ...enrollments.map(e => String(e.batch_id))
    ]);
    
    student.batchIds = Array.from(allStudentBatchIdsSet).map(id => new Types.ObjectId(id));

    // Secure checking
    const accessibleBatchIds = await this.checkTeacherStudentAccess(callingUser, student);

    // Resolve course/batch details
    const enrolledCourses: any[] = [];
    const studentBatchIds = accessibleBatchIds;

    if (studentBatchIds.length > 0) {
      const courses = await this.courseModel
        .find({ 'batch._id': { $in: student.batchIds } })
        .lean();

      for (const course of courses) {
        // Find which batch the student is in for this course
        const b = course.batch.find((b) => b._id ? studentBatchIds.includes(String(b._id)) : false);
        if (!b) continue;

        let headTeacherName = 'N/A';
        let headTeacherAvatar: string | null = null;
        if (course.head_teacher) {
          const ht = await this.teacherModel.findById(course.head_teacher).lean();
          if (ht) {
            const typedHt = ht as unknown as { firstName: string; lastName: string; photo?: string };
            headTeacherName = `${typedHt.firstName} ${typedHt.lastName}`;
            headTeacherAvatar = typedHt.photo || null;
          }
        }

        let categoryName = 'N/A';
        if (course.category_id) {
          const cat = await this.categoryModel.findById(course.category_id).lean();
          if (cat) {
            categoryName = cat.category_name;
          }
        }

        // Progress = completed assignments / total assignments for this specific batch
        let progressPercentage = 0;
        try {
          const AssignmentModel = this.connection.model('Assignment');
          const SubmissionModel = this.connection.model('AssignmentSubmission');

          const totalAssignments = await AssignmentModel.countDocuments({
            batchId: b._id,
            status: 'published',
          });

          if (totalAssignments > 0) {
            const completedSubmissions = await SubmissionModel.countDocuments({
              studentId: new Types.ObjectId(studentId),
              assignmentId: { $in: await AssignmentModel.find({ batchId: b._id }).distinct('_id') },
              status: { $in: ['Submitted', 'Graded'] },
            });
            progressPercentage = Math.round((completedSubmissions / totalAssignments) * 100);
          }
        } catch (err) {
          this.logger.error('Error calculating progress percentage', err);
        }

        enrolledCourses.push({
          courseId: String(course._id),
          courseName: course.course_name,
          courseImage: course.course_image_url || null,
          batchId: String(b._id),
          batchName: b.batchName,
          categoryName,
          headTeacherName,
          headTeacherAvatar,
          courseProgress: `${progressPercentage}%`,
        });
      }
    }

    const typedStudent = student as unknown as {
      _id: Types.ObjectId;
      firstName: string;
      lastName: string;
      email: string;
      profileImg?: string;
      phone?: string;
      createdAt?: Date;
      career?: string;
      topics?: string[];
      educationLevel?: string;
    };

    return {
      status: true,
      data: {
        student_id: String(typedStudent._id),
        name: `${typedStudent.firstName} ${typedStudent.lastName}`,
        email: typedStudent.email,
        phone: typedStudent.phone || 'N/A',
        avatar: typedStudent.profileImg || null,
        joinedDate: typedStudent.createdAt
          ? new Date(typedStudent.createdAt).toLocaleDateString('en-US')
          : 'N/A',
        careerObjective: typedStudent.career || 'N/A',
        preferredTopics: typedStudent.topics || [],
        highestEducation: typedStudent.educationLevel || 'N/A',
        enrolledCourses,
      },
    };
  }

  async getStudentSubmissions(userId: string, studentId: string) {
    const callingUser = await this.userModel.findById(userId).lean();
    if (!callingUser) throw new NotFoundException('Calling user not found');

    const student = await this.userModel.findById(studentId).lean();
    if (!student) throw new NotFoundException('Student not found');

    const enrollments = await this.connection.collection('batch_enrolled_students').find({
      student_id: new Types.ObjectId(studentId)
    }).toArray();
    
    const allStudentBatchIdsSet = new Set([
      ...(student.batchIds ? student.batchIds.map(String) : []),
      ...enrollments.map(e => String(e.batch_id))
    ]);
    
    student.batchIds = Array.from(allStudentBatchIdsSet).map(id => new Types.ObjectId(id));

    const accessibleBatchIds = await this.checkTeacherStudentAccess(callingUser, student);

    const studentBatchIds = accessibleBatchIds;

    let assignmentsData: Record<string, unknown>[] = [];
    let quizzesData: Record<string, unknown>[] = [];

    try {
      const AssignmentModel = this.connection.model('Assignment');
      const SubmissionModel = this.connection.model('AssignmentSubmission');
      const QuizModel = this.connection.model('Quiz');
      const QuizSubmissionModel = this.connection.model('QuizSubmission');

      // Fetch all assignments for these batches
      const assignments = (await AssignmentModel.find({
        batchId: { $in: studentBatchIds },
        status: 'published',
      }).lean()) as unknown as {
        _id: Types.ObjectId;
        assignmentName: string;
        overview: string;
        dueDate: Date;
      }[];

      const assignmentIds = assignments.map((a) => a._id);
      const submissions = (await SubmissionModel.find({
        assignmentId: { $in: assignmentIds },
        studentId: new Types.ObjectId(studentId),
      }).lean()) as unknown as {
        assignmentId: Types.ObjectId;
        status: string;
        dateOfSubmit?: Date;
        result?: unknown;
        feedback?: string;
      }[];

      assignmentsData = assignments.map((a) => {
        const sub = submissions.find(
          (s) => String(s.assignmentId) === String(a._id),
        );
        return {
          id: String(a._id),
          title: a.assignmentName,
          description: a.overview,
          dueDate: new Date(a.dueDate).toLocaleDateString('en-US', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          }),
          status: sub ? sub.status : 'Not Started',
          submittedDate: sub?.dateOfSubmit
            ? new Date(sub.dateOfSubmit).toLocaleDateString('en-US', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })
            : null,
          score: sub?.result || null,
          feedback: sub?.feedback || null,
        };
      });

      // Fetch all quizzes for these batches
      const quizzes = (await QuizModel.find({
        batchId: { $in: studentBatchIds },
        status: 'published',
      }).lean()) as unknown as {
        _id: Types.ObjectId;
        quizName: string;
        quizType: string;
        overview: string;
        dueDate: Date;
      }[];

      const quizIds = quizzes.map((q) => q._id);
      const quizSubmissions = (await QuizSubmissionModel.find({
        quizId: { $in: quizIds },
        studentId: new Types.ObjectId(studentId),
      }).lean()) as unknown as {
        quizId: Types.ObjectId;
        status: string;
        dateOfSubmit?: Date;
        obtainedScore?: number;
        totalMarks?: number;
        feedback?: string;
      }[];

      quizzesData = quizzes.map((q) => {
        const sub = quizSubmissions.find(
          (s) => String(s.quizId) === String(q._id),
        );
        return {
          id: String(q._id),
          title: q.quizName,
          tags:
            q.quizType === 'mcq'
              ? ['MCQ']
              : q.quizType === 'essay'
                ? ['Essay']
                : ['Mixed'],
          description: q.overview,
          status: sub ? sub.status : 'Not Started',
          dueDate: new Date(q.dueDate).toLocaleDateString('en-US', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          }),
          submittedOn: sub?.dateOfSubmit
            ? new Date(sub.dateOfSubmit).toLocaleDateString('en-US', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })
            : null,
          score: sub ? `${sub.obtainedScore}/${sub.totalMarks}` : null,
          feedback: sub?.feedback || null,
        };
      });
    } catch (err) {
      this.logger.error('Error fetching submissions and quizzes', err);
    }

    return {
      status: true,
      data: {
        assignments: assignmentsData,
        quizzes: quizzesData,
      },
    };
  }

  async getMyEvaluations(userId: string, courseId?: string, batchId?: string) {
    const user = await this.userModel.findById(userId).lean();
    if (!user) throw new NotFoundException('User not found');

    let studentBatchIds: string[] = [];
    if (batchId) {
      studentBatchIds = [batchId];
    } else if (user.batchIds && user.batchIds.length > 0) {
      studentBatchIds = user.batchIds.map(String);
    } else {
      const BatchEnrolled = this.connection.collection('batch_enrolled_students');
      const query: Record<string, unknown> = { student_id: new Types.ObjectId(userId) };
      if (courseId) query.course_id = new Types.ObjectId(courseId);
      const enrollments = await BatchEnrolled.find(query).toArray();
      studentBatchIds = enrollments.map((e) => String(e.batch_id)).filter(Boolean);
    }

    let assignmentsData: Record<string, unknown>[] = [];
    let quizzesData: Record<string, unknown>[] = [];

    try {
      const AssignmentModel = this.connection.model('Assignment');
      const SubmissionModel = this.connection.model('AssignmentSubmission');
      const QuizModel = this.connection.model('Quiz');
      const QuizSubmissionModel = this.connection.model('QuizSubmission');

      const assignQuery: Record<string, unknown> = { status: 'published' };
      if (studentBatchIds.length > 0) {
        assignQuery.batchId = { $in: studentBatchIds };
      } else if (courseId) {
        assignQuery.courseId = new Types.ObjectId(courseId);
      }

      const assignments = (await AssignmentModel.find(assignQuery).lean()) as any[];
      const assignmentIds = assignments.map((a) => a._id);
      const submissions = (await SubmissionModel.find({
        assignmentId: { $in: assignmentIds },
        studentId: new Types.ObjectId(userId),
      }).lean()) as any[];

      assignmentsData = assignments.map((a) => {
        const sub = submissions.find(
          (s) => String(s.assignmentId) === String(a._id),
        );
        return {
          id: String(a._id),
          title: a.assignmentName,
          type: 'Assignment',
          description: a.overview,
          dueDate: a.dueDate
            ? new Date(a.dueDate).toLocaleDateString('en-US', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })
            : 'No Due Date',
          status: sub ? (sub.status || 'Submitted') : 'Not Started',
          submittedDate: sub?.dateOfSubmit
            ? new Date(sub.dateOfSubmit).toLocaleDateString('en-US', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })
            : null,
          score:
            sub?.result !== undefined && sub?.result !== null
              ? Number(sub.result)
              : sub?.obtainedScore ?? null,
          totalMarks: a.totalMarks || 100,
          feedback: sub?.feedback || null,
        };
      });

      const quizQuery: Record<string, unknown> = { status: 'published' };
      if (studentBatchIds.length > 0) {
        quizQuery.batchId = { $in: studentBatchIds };
      } else if (courseId) {
        quizQuery.courseId = new Types.ObjectId(courseId);
      }

      const quizzes = (await QuizModel.find(quizQuery).lean()) as any[];
      const quizIds = quizzes.map((q) => q._id);
      const quizSubmissions = (await QuizSubmissionModel.find({
        quizId: { $in: quizIds },
        studentId: new Types.ObjectId(userId),
      }).lean()) as any[];

      quizzesData = quizzes.map((q) => {
        const sub = quizSubmissions.find(
          (s) => String(s.quizId) === String(q._id),
        );
        return {
          id: String(q._id),
          title: q.quizName,
          type: 'Quiz',
          tags: q.quizType === 'mcq' ? ['MCQ'] : ['Mixed'],
          description: q.overview,
          status: sub ? (sub.status || 'Completed') : 'Not Started',
          dueDate: q.dueDate
            ? new Date(q.dueDate).toLocaleDateString('en-US', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })
            : 'No Due Date',
          submittedDate: sub?.dateOfSubmit
            ? new Date(sub.dateOfSubmit).toLocaleDateString('en-US', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })
            : null,
          score: sub?.obtainedScore !== undefined ? sub.obtainedScore : null,
          totalMarks: sub?.totalMarks || q.totalMarks || 100,
          feedback: sub?.feedback || null,
        };
      });
    } catch (err) {
      this.logger.error('Error fetching student evaluations', err);
    }

    // Calculate performance statistics
    const totalItems = assignmentsData.length + quizzesData.length;
    const completedAssignments = assignmentsData.filter(
      (a) => a.status !== 'Not Started',
    );
    const completedQuizzes = quizzesData.filter(
      (q) => q.status !== 'Not Started',
    );
    const totalCompleted =
      completedAssignments.length + completedQuizzes.length;

    let totalScoreSum = 0;
    let gradedCount = 0;
    [...completedAssignments, ...completedQuizzes].forEach((item: any) => {
      if (item.score !== null && item.score !== undefined && item.totalMarks) {
        const percentage = (Number(item.score) / Number(item.totalMarks)) * 100;
        totalScoreSum += percentage;
        gradedCount++;
      }
    });

    const averageScore =
      gradedCount > 0 ? Math.round(totalScoreSum / gradedCount) : 0;
    const isPassed = totalCompleted > 0 && averageScore >= 50;

    return {
      status: true,
      data: {
        assignments: assignmentsData,
        quizzes: quizzesData,
        stats: {
          totalItems,
          totalCompleted,
          gradedCount,
          averageScore,
          isPassed,
          resultRemark: isPassed
            ? 'Pass'
            : totalCompleted === 0
              ? 'Not Started'
              : 'Needs Improvement',
          certificateEligible:
            isPassed &&
            totalCompleted / Math.max(1, totalItems) >= 0.7,
        },
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CART, FAVORITES & CHECKOUTPersistence
  // ─────────────────────────────────────────────────────────────────────────

  async addToCart(userId: string, courseId: string) {
    const cartsCol = this.connection.collection('carts');
    const existing = await cartsCol.findOne({
      student_id: new Types.ObjectId(userId),
      course_id: new Types.ObjectId(courseId),
    });
    if (!existing) {
      await cartsCol.insertOne({
        student_id: new Types.ObjectId(userId),
        course_id: new Types.ObjectId(courseId),
        createdAt: new Date(),
      });
    }
    const total = await cartsCol.countDocuments({
      student_id: new Types.ObjectId(userId),
    });
    return {
      status: true,
      message: 'Course added to cart successfully',
      data: { total_courses: total },
    };
  }

  async getCartList(userId: string) {
    const cartsCol = this.connection.collection('carts');
    const cartItems = await cartsCol
      .find({
        student_id: new Types.ObjectId(userId),
      })
      .toArray();
    const courseIds = cartItems.map((item) => item.course_id);

    const courses = await this.courseModel
      .find({ _id: { $in: courseIds } })
      .lean();

    const course_items = await Promise.all(
      courses.map(async (c) => {
        const headTeacher = c.head_teacher
          ? await this.teacherModel.findById(c.head_teacher).lean()
          : null;
        return {
          course_id: c._id.toString(),
          course_name: c.course_name,
          course_url: c.course_image_url || '',
          instructor_image_url:
            (headTeacher as unknown as { photo?: string })?.photo || '',
          head_teacher: headTeacher
            ? `${(headTeacher as unknown as { firstName?: string; lastName?: string }).firstName || ''} ${(headTeacher as unknown as { firstName?: string; lastName?: string }).lastName || ''}`.trim()
            : 'Instructor',
          total: c.course_price || 0,
          batches: c.batch || [],
        };
      }),
    );

    const subtotal = course_items.reduce((sum, item) => sum + item.total, 0);
    const tax_total = parseFloat((subtotal * 0.1).toFixed(2)); // 10% tax
    const discount_total = 0;
    const grand_total = subtotal + tax_total - discount_total;

    return {
      status: true,
      message: 'Cart retrieved successfully',
      data: {
        course_items,
        subtotal,
        tax_total,
        discount_total,
        grand_total,
      },
    };
  }

  async removeFromCart(userId: string, courseId: string) {
    const cartsCol = this.connection.collection('carts');
    await cartsCol.deleteOne({
      student_id: new Types.ObjectId(userId),
      course_id: new Types.ObjectId(courseId),
    });
    const total = await cartsCol.countDocuments({
      student_id: new Types.ObjectId(userId),
    });
    return {
      status: true,
      message: 'Course removed from cart successfully',
      data: { total_courses: total },
    };
  }

  async addToFavorite(userId: string, courseId: string) {
    const likesCol = this.connection.collection('likes');
    const existing = await likesCol.findOne({
      student_id: new Types.ObjectId(userId),
      course_id: new Types.ObjectId(courseId),
    });
    if (!existing) {
      await likesCol.insertOne({
        student_id: new Types.ObjectId(userId),
        course_id: new Types.ObjectId(courseId),
        createdAt: new Date(),
      });
    }
    return {
      status: true,
      message: 'Course saved to favorites successfully',
    };
  }

  async getFavoriteCourses(userId: string) {
    const likesCol = this.connection.collection('likes');
    const items = await likesCol
      .find({
        student_id: new Types.ObjectId(userId),
      })
      .toArray();
    const courseIds = items.map((item) => item.course_id);

    const courses = await this.courseModel
      .find({ _id: { $in: courseIds } })
      .lean();
    const course_list = await Promise.all(
      courses.map(async (c) => {
        const headTeacher = c.head_teacher
          ? await this.teacherModel.findById(c.head_teacher).lean()
          : null;
        return {
          course_id: c._id.toString(),
          course_name: c.course_name,
          course_image_url: c.course_image_url || '',
          course_price: c.course_price || 0,
          course_type: c.course_type,
          total: c.course_price || 0,
          head_teacher: headTeacher
            ? `${(headTeacher as unknown as { firstName?: string; lastName?: string }).firstName || ''} ${(headTeacher as unknown as { firstName?: string; lastName?: string }).lastName || ''}`.trim()
            : 'Instructor',
          cart_status: false,
        };
      }),
    );

    return {
      status: true,
      data: {
        course_list,
        total_courses: course_list.length,
      },
    };
  }

  async removeFromFavorite(userId: string, courseId: string) {
    const likesCol = this.connection.collection('likes');
    await likesCol.deleteOne({
      student_id: new Types.ObjectId(userId),
      course_id: new Types.ObjectId(courseId),
    });
    return {
      status: true,
      message: 'Course removed from favorites successfully',
    };
  }

  async purchaseCourses(
    userId: string,
    courseIds: string[],
    batchIds?: string[],
  ) {
    const enrollmentsCol = this.connection.collection(
      'batch_enrolled_students',
    );
    const batchesCol = this.connection.collection('batches');
    const cartsCol = this.connection.collection('carts');

    for (let i = 0; i < courseIds.length; i++) {
      const cid = courseIds[i];
      const bid = batchIds && batchIds[i] ? batchIds[i] : null;

      const course = await this.courseModel.findById(cid);
      if (!course) continue;

      // Find or create batch
      let batch: { _id: Types.ObjectId; name: string } | null = null;
      if (bid) {
        const batchDoc = await batchesCol.findOne({
          _id: new Types.ObjectId(bid),
        });
        if (batchDoc) {
          batch = {
            _id: batchDoc._id,
            name: batchDoc.name || batchDoc.batchName || 'Regular Batch',
          };
        } else {
          const courseBatch = course.batch?.find(
            (b) => b._id?.toString() === bid,
          );
          const batchName = courseBatch?.batchName || 'Regular Batch';
          const insertRes = await batchesCol.insertOne({
            _id: new Types.ObjectId(bid),
            name: batchName,
            course_id: new Types.ObjectId(cid),
            teacher_id: null,
            organisation_id: course.organisation_id || null,
            chat_group_id: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          batch = { _id: insertRes.insertedId, name: batchName };
        }
      } else {
        const batchDoc = await batchesCol.findOne({
          course_id: new Types.ObjectId(cid),
        });
        if (batchDoc) {
          batch = {
            _id: batchDoc._id,
            name: batchDoc.name || batchDoc.batchName || 'Regular Batch',
          };
        } else {
          const batchName = course.batch?.[0]?.batchName || 'Regular Batch';
          const batchIdToUse = course.batch?.[0]?._id ? new Types.ObjectId(course.batch[0]._id) : new Types.ObjectId();
          const insertRes = await batchesCol.insertOne({
            _id: batchIdToUse,
            name: batchName,
            course_id: new Types.ObjectId(cid),
            teacher_id: null,
            organisation_id: course.organisation_id || null,
            chat_group_id: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          batch = { _id: insertRes.insertedId, name: batchName };
        }
      }

      // Check if enrolled already
      const enrolled = await enrollmentsCol.findOne({
        student_id: new Types.ObjectId(userId),
        batch_id: batch._id,
      });

      if (!enrolled) {
        await enrollmentsCol.insertOne({
          student_id: new Types.ObjectId(userId),
          batch_id: batch._id,
          course_id: new Types.ObjectId(cid),
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // Increment count
        await this.courseModel.findByIdAndUpdate(cid, {
          $inc: { enrolled_user_count: 1 },
        });

        // Update the student's batchIds so they appear in instructor lists
        await this.userModel.findByIdAndUpdate(userId, {
          $addToSet: { batchIds: batch._id },
        });

        // Add student to batch chat group
        try {
          await this.communicationService.ensureGroupForBatch(
            cid,
            String(batch._id),
            `${course.course_name || 'Course'} — ${batch.name}`,
            [userId],
          );
          await this.communicationService.addMember(String(batch._id), userId);
        } catch (err) {
          this.logger.warn(`Chat membership failed for batch ${batch._id}`);
        }
      }

      // Clear from cart
      await cartsCol.deleteOne({
        student_id: new Types.ObjectId(userId),
        course_id: new Types.ObjectId(cid),
      });
    }

    return {
      status: true,
      message: 'Courses purchased and enrolled successfully',
    };
  }

  async getEnrolledCourses(userId: string, query: Record<string, unknown>) {
    const enrollmentsCol = this.connection.collection(
      'batch_enrolled_students',
    );
    const enrollments = await enrollmentsCol
      .find({
        student_id: new Types.ObjectId(userId),
      })
      .toArray();

    const courses_list = await Promise.all(
      enrollments.map(async (e) => {
        const c = await this.courseModel.findById(e.course_id).lean();
        if (!c) return null;
        const headTeacher = c.head_teacher
          ? await this.teacherModel.findById(c.head_teacher).lean()
          : null;
        return {
          course_id: c._id.toString(),
          batch_id: e.batch_id?.toString() || '',
          course_name: c.course_name,
          course_image_url: c.course_image_url || '',
          progress: await this.getProgressPercent(userId, c._id.toString(), e.batch_id?.toString() || ''),
          name: headTeacher
            ? `${(headTeacher as unknown as { firstName?: string; lastName?: string }).firstName || ''} ${(headTeacher as unknown as { firstName?: string; lastName?: string }).lastName || ''}`.trim()
            : 'Instructor',
          instructor_url:
            (headTeacher as unknown as { photo?: string })?.photo || '',
          enrolled_at: e.createdAt || new Date().toISOString(),
        };
      }),
    );

    const filtered = courses_list.filter((x) => x !== null);

    return {
      status: true,
      data: {
        courses: filtered,
        total_count: filtered.length,
      },
    };
  }

  async getCourseReviews(courseId: string) {
    if (!Types.ObjectId.isValid(courseId)) {
      throw new BadRequestException('Invalid courseId format');
    }
    const reviews = await this.reviewModel
      .find({ course_id: new Types.ObjectId(courseId) })
      .sort({ createdAt: -1 })
      .lean();
    return { status: true, data: reviews };
  }

  async createCourseReview(userId: string, userName: string, courseId: string, rating: number, reviewText: string) {
    if (!Types.ObjectId.isValid(courseId)) {
      throw new BadRequestException('Invalid courseId format');
    }

    const enrolled = await this.connection
      .collection('batch_enrolled_students')
      .findOne({
        student_id: new Types.ObjectId(userId),
        course_id: new Types.ObjectId(courseId),
      });
    if (!enrolled) {
      throw new ForbiddenException('Only enrolled students can review this course');
    }

    const user = await this.userModel.findById(userId).lean();
    const resolvedName =
      userName && userName !== 'Student'
        ? userName
        : user
          ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Student'
          : 'Student';

    // Check if user already reviewed
    const existing = await this.reviewModel.findOne({ 
      user_id: new Types.ObjectId(userId), 
      course_id: new Types.ObjectId(courseId) 
    });
    
    if (existing) {
      throw new BadRequestException('You have already reviewed this course.');
    }

    const review = await this.reviewModel.create({
      user_id: new Types.ObjectId(userId),
      course_id: new Types.ObjectId(courseId),
      rating,
      review: reviewText,
      user_name: resolvedName,
    });

    const stats = await this.reviewModel.aggregate([
      { $match: { course_id: new Types.ObjectId(courseId) } },
      {
        $group: {
          _id: '$course_id',
          average_rating: { $avg: '$rating' },
          review_count: { $sum: 1 },
        },
      },
    ]);

    if (stats[0]) {
      await this.courseModel.findByIdAndUpdate(courseId, {
        average_rating: Math.round(stats[0].average_rating * 10) / 10,
        review_count: stats[0].review_count,
      });
    }

    return { status: true, message: 'Review created successfully', data: review };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // COURSE PROGRESS TRACKING
  // ─────────────────────────────────────────────────────────────────────────

  private async recomputeProgress(
    studentId: string,
    courseId: string,
    batchId: string,
  ): Promise<number> {
    const progress = await this.progressModel.findOne({
      student_id: new Types.ObjectId(studentId),
      course_id: new Types.ObjectId(courseId),
      batch_id: batchId,
    });
    if (!progress) return 0;

    const [lessons, sublessons, totalAssignments, totalQuizzes] =
      await Promise.all([
        this.lessonModel.find({ course_id: new Types.ObjectId(courseId) }).lean(),
        this.subLessonModel.find({ course_id: new Types.ObjectId(courseId) }).lean(),
        this.connection
          .collection('assignments')
          .countDocuments({ courseId: new Types.ObjectId(courseId), batchId, status: 'published' }),
        this.connection
          .collection('quizzes')
          .countDocuments({ courseId: new Types.ObjectId(courseId), batchId, status: 'published' }),
      ]);

    let totalMaterialCount = 0;
    lessons.forEach(l => { totalMaterialCount += (l.studyMaterials || []).length; });
    sublessons.forEach(s => { totalMaterialCount += (s.studyMaterials || []).length; });

    const totalItems = totalMaterialCount + totalAssignments + totalQuizzes;
    if (totalItems === 0) return 0;

    const completedItems =
      (progress.completed_materials?.length || 0) +
      (progress.completed_assignments?.length || 0) +
      (progress.completed_quizzes?.length || 0);

    const percent = Math.round((completedItems / totalItems) * 100);
    const completedAt = percent >= 100 ? new Date() : null;

    await this.progressModel.findByIdAndUpdate(progress._id, {
      $set: { progress_percent: percent, completed_at: completedAt },
    });

    return percent;
  }

  /** Internal helper: get persisted progress % without recomputing */
  private async getProgressPercent(
    studentId: string,
    courseId: string,
    batchId: string,
  ): Promise<number> {
    const p = await this.progressModel.findOne({
      student_id: new Types.ObjectId(studentId),
      course_id: new Types.ObjectId(courseId),
      batch_id: batchId,
    });
    return p?.progress_percent ?? 0;
  }

  /** GET /auth/course/v1/progress — student's own progress */
  async getCourseProgress(studentId: string, courseId: string, batchId: string) {
    // Ensure record exists
    await this.progressModel.findOneAndUpdate(
      {
        student_id: new Types.ObjectId(studentId),
        course_id: new Types.ObjectId(courseId),
        batch_id: batchId,
      },
      { $setOnInsert: { completed_materials: [], completed_assignments: [], completed_quizzes: [], progress_percent: 0, completed_at: null } },
      { upsert: true, new: true },
    );

    const percent = await this.recomputeProgress(studentId, courseId, batchId);
    const doc = await this.progressModel.findOne({
      student_id: new Types.ObjectId(studentId),
      course_id: new Types.ObjectId(courseId),
      batch_id: batchId,
    });

    return {
      status: true,
      data: {
        progress_percent: percent,
        completed_materials: doc?.completed_materials || [],
        completed_assignments: (doc?.completed_assignments || []).map(String),
        completed_quizzes: (doc?.completed_quizzes || []).map(String),
        completed_at: doc?.completed_at || null,
      },
    };
  }

  /** POST /auth/course/v1/progress/complete-lesson */
  async markLessonComplete(
    studentId: string,
    lessonId: string,
    courseId: string,
    batchId: string,
  ) {
    await this.progressModel.findOneAndUpdate(
      {
        student_id: new Types.ObjectId(studentId),
        course_id: new Types.ObjectId(courseId),
        batch_id: batchId,
      },
      {
        $addToSet: { completed_lessons: new Types.ObjectId(lessonId) },
        $setOnInsert: { completed_sublessons: [], completed_assignments: [], completed_quizzes: [], progress_percent: 0, completed_at: null },
      },
      { upsert: true, new: true },
    );

    const percent = await this.recomputeProgress(studentId, courseId, batchId);
    return { status: true, message: 'Lesson marked complete', data: { progress_percent: percent } };
  }

  /** POST /auth/course/v1/progress/complete-material */
  async markMaterialComplete(
    studentId: string,
    materialUrl: string,
    courseId: string,
    batchId: string,
  ) {
    await this.progressModel.findOneAndUpdate(
      {
        student_id: new Types.ObjectId(studentId),
        course_id: new Types.ObjectId(courseId),
        batch_id: batchId,
      },
      {
        $addToSet: { completed_materials: materialUrl },
        $setOnInsert: { completed_assignments: [], completed_quizzes: [], progress_percent: 0, completed_at: null },
      },
      { upsert: true, new: true },
    );

    const percent = await this.recomputeProgress(studentId, courseId, batchId);
    return { status: true, message: 'Material marked complete', data: { progress_percent: percent } };
  }
}
