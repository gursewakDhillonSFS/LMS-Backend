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
  ) {}

  // ─── Helper: build flat course response ───────────────────────────────────
  private async buildCourseResponse(course: CourseDocument, userId?: string | null) {
    let callingUser: any = null;
    if (userId) {
      callingUser = await this.userModel.findById(userId).lean();
    }

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
          return {
            course_id: c._id,
            course_name: c.course_name,
            course_image_url: c.course_image_url,
            course_status: c.course_status,
            course_type: c.course_type,
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
      course_name: course.course_name,
      course_image_url: course.course_image_url,
      course_price: course.course_price,
      course_type: course.course_type,
      course_duration: course.duration,
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
      learning_points: course.learning_points,
      course_learning_points: course.learning_points, // alias used by CourseInfoDataProp
      skills_you_gain: course.skills_you_gain,
      about_course: course.about_course,
      description: course.description,
      overview: course.overview,
      enrolled_user_count: course.enrolled_user_count,
      average_rating: course.average_rating,
      review_count: course.review_count,
      created_at: (course as unknown as { createdAt?: Date }).createdAt,
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
    if (fields.organisation_id) {
      orgId = new Types.ObjectId(fields.organisation_id);
    }

    // Build update payload
    const payload: Record<string, unknown> = {
      course_name: fields.course_name,
      ...(fields.head_teacher && {
        head_teacher: new Types.ObjectId(fields.head_teacher),
      }),
      ...(fields.duration && { duration: fields.duration }),
      ...(fields.course_type && { course_type: fields.course_type }),
      ...(fields.course_price !== undefined && {
        course_price: Number(fields.course_price),
      }),
      ...(fields.demo_class !== undefined && { demo_class: fields.demo_class }),
      ...(fields.category_id && {
        category_id: new Types.ObjectId(fields.category_id),
      }),
      ...(fields.course_schedule && {
        course_schedule: fields.course_schedule,
      }),
      ...(fields.live_classes !== undefined && {
        live_classes: fields.live_classes,
      }),
      ...(fields.batch && { batch: fields.batch }),
      ...(orgId && { organisation_id: orgId }),
    };

    let course: CourseDocument;

    if (course_id) {
      // ── Upsert: user went back and resubmitted ──────────────────────────
      const existing = await this.courseModel.findById(course_id);
      if (!existing) throw new NotFoundException('Course not found');

      course = (await this.courseModel.findByIdAndUpdate(
        course_id,
        { $set: payload },
        { new: true },
      )) as CourseDocument;
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
        ...(course_image_url && { course_image_url }),
      },
    });

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

    // ─── Smart Teacher Data Isolation ─────────────────────────────────────
    const callingUser = userId ? await this.userModel.findById(userId).lean() : null;
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

        return {
          course_id: c._id,
          course_name: c.course_name,
          course_image_url: c.course_image_url,
          course_status: c.course_status,
          course_type: c.course_type,
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
                return b.teacher === String(callingUser.teacherId);
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

  async getCourseDetails(courseId: string, userId?: string | null) {
    const course = await this.courseModel.findById(courseId);
    if (!course) throw new NotFoundException('Course not found');

    const detail = await this.buildCourseResponse(course, userId);
    return { status: true, data: detail };
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

  async createLesson(dto: CreateLessonDto, file?: Express.Multer.File) {
    await this.guardCourse(dto.course_id);

    let file_url: string | null = null;
    let file_name: string | null = null;
    let file_type: string | null = null;

    if (file) {
      const uploaded = await this.cloudinary.uploadFile(file, 'lms/lessons');
      file_url = uploaded.secure_url;
      file_name = file.originalname;
      file_type = file.mimetype.startsWith('video') ? 'video' : 'pdf';
    }

    const lesson = await this.lessonModel.create({
      course_id: new Types.ObjectId(dto.course_id),
      lesson_name: dto.lesson_name,
      lesson_description: dto.description ?? null,
      unlock_after_previous: dto.unlock_after_previous ?? false,
      file_url,
      file_name,
      file_type,
      uploaded_at: new Date(),
    });

    return {
      status: true,
      message: 'Lesson created',
      data: { lesson_id: lesson._id },
    };
  }

  async updateLesson(dto: UpdateLessonDto, file?: Express.Multer.File) {
    const lesson = await this.lessonModel.findById(dto.lesson_id);
    if (!lesson) throw new NotFoundException('Lesson not found');

    let file_url = lesson.file_url;
    let file_name = lesson.file_name;
    let file_type = lesson.file_type;

    if (file) {
      const uploaded = await this.cloudinary.uploadFile(file, 'lms/lessons');
      file_url = uploaded.secure_url;
      file_name = file.originalname;
      file_type = file.mimetype.startsWith('video') ? 'video' : 'pdf';
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
        file_url,
        file_name,
        file_type,
      },
    });

    return {
      status: true,
      message: 'Lesson updated',
      data: { lesson_id: dto.lesson_id },
    };
  }

  async deleteLesson(lessonId: string) {
    const lesson = await this.lessonModel.findByIdAndDelete(lessonId);
    if (!lesson) throw new NotFoundException('Lesson not found');

    // Cascade delete sublessons
    await this.subLessonModel.deleteMany({
      lesson_id: new Types.ObjectId(lessonId),
    });

    return { status: true, message: 'Lesson deleted' };
  }

  async getLessonsWithSublessons(courseId: string) {
    const course = await this.courseModel.findById(courseId).lean();
    const overview = course ? course.overview : '';

    const lessons = await this.lessonModel
      .find({ course_id: new Types.ObjectId(courseId) })
      .lean();

    const lessonIds = lessons.map(
      (l) => (l as unknown as { _id: Types.ObjectId })._id,
    );
    const sublessons = await this.subLessonModel
      .find({ lesson_id: { $in: lessonIds } })
      .lean();

    const lessonData = lessons.map((l) => ({
      lesson_id: (l as unknown as { _id: Types.ObjectId })._id,
      lesson_name: l.lesson_name,
      lesson_description: l.lesson_description,
      file_url: l.file_url,
      file_name: l.file_name,
      file_type: l.file_type,
      unlock_after_previous: l.unlock_after_previous,
      uploaded_at: l.uploaded_at,
      sublessons: sublessons
        .filter(
          (s) =>
            String(s.lesson_id) ===
            String((l as unknown as { _id: Types.ObjectId })._id),
        )
        .map((s) => ({
          sublesson_id: (s as unknown as { _id: Types.ObjectId })._id,
          sublesson_name: s.sublesson_name,
          sublesson_description: s.sublesson_description,
          file_url: s.file_url,
          file_name: s.file_name,
          file_type: s.file_type,
          duration: s.duration,
          uploaded_at: s.uploaded_at,
        })),
    }));

    return { status: true, data: { lessons: lessonData, overview } };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUBLESSON CRUD
  // ─────────────────────────────────────────────────────────────────────────

  async createSubLesson(dto: CreateSubLessonDto, file?: Express.Multer.File) {
    await this.guardCourse(dto.course_id);
    const lesson = await this.lessonModel.findById(dto.lesson_id);
    if (!lesson) throw new NotFoundException('Lesson not found');

    let file_url: string | null = null;
    let file_name: string | null = null;
    let file_type: string | null = null;

    if (file) {
      const uploaded = await this.cloudinary.uploadFile(file, 'lms/sublessons');
      file_url = uploaded.secure_url;
      file_name = file.originalname;
      file_type = file.mimetype.startsWith('video') ? 'video' : 'pdf';
    }

    const sub = await this.subLessonModel.create({
      course_id: new Types.ObjectId(dto.course_id),
      lesson_id: new Types.ObjectId(dto.lesson_id),
      sublesson_name: dto.Sublesson_name,
      sublesson_description: dto.description ?? null,
      file_url,
      file_name,
      file_type,
      uploaded_at: new Date(),
    });

    return {
      status: true,
      message: 'Sub-lesson created',
      data: { sublesson_id: sub._id },
    };
  }

  async updateSubLesson(dto: UpdateSubLessonDto, file?: Express.Multer.File) {
    const sub = await this.subLessonModel.findById(dto.sublesson_id);
    if (!sub) throw new NotFoundException('Sub-lesson not found');

    let file_url = sub.file_url;
    let file_name = sub.file_name;
    let file_type = sub.file_type;

    if (file) {
      const uploaded = await this.cloudinary.uploadFile(file, 'lms/sublessons');
      file_url = uploaded.secure_url;
      file_name = file.originalname;
      file_type = file.mimetype.startsWith('video') ? 'video' : 'pdf';
    }

    await this.subLessonModel.findByIdAndUpdate(dto.sublesson_id, {
      $set: {
        ...(dto.Sublesson_name && { sublesson_name: dto.Sublesson_name }),
        ...(dto.description !== undefined && {
          sublesson_description: dto.description,
        }),
        file_url,
        file_name,
        file_type,
      },
    });

    return {
      status: true,
      message: 'Sub-lesson updated',
      data: { sublesson_id: dto.sublesson_id },
    };
  }

  async deleteSubLesson(sublessonId: string) {
    const sub = await this.subLessonModel.findByIdAndDelete(sublessonId);
    if (!sub) throw new NotFoundException('Sub-lesson not found');
    return { status: true, message: 'Sub-lesson deleted' };
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
    return { status: true, message: 'Batch deleted successfully' };
  }

  // ─── Guard helper ─────────────────────────────────────────────────────────
  private async guardCourse(courseId: string): Promise<CourseDocument> {
    const course = await this.courseModel.findById(courseId);
    if (!course) throw new NotFoundException('Course not found');
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
      organisationId: callingUser.organisationId,
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

      if (batchId) {
        if (!allowedBatchIdsSet.has(batchId)) {
          throw new ForbiddenException('You do not have access to this batch');
        }
        queryFilter.batchIds = new Types.ObjectId(batchId);
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
        queryFilter.batchIds = { $in: courseBatchIds };
      } else {
        queryFilter.batchIds = { $in: allowedBatchIds };
      }
    } else {
      // For administrators/instructors
      if (batchId) {
        queryFilter.batchIds = new Types.ObjectId(batchId);
      } else if (courseId) {
        const course = await this.courseModel.findById(courseId).lean();
        if (course && course.batch && course.batch.length > 0) {
          const batchIds = course.batch.map((b) => new Types.ObjectId(b._id));
          queryFilter.batchIds = { $in: batchIds };
        } else {
          return { status: true, data: [] };
        }
      }
    }

    if (search) {
      queryFilter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const students = await this.userModel.find(queryFilter).lean();

    const formattedStudents = students.map((student: unknown) => {
      const s = student as {
        _id: Types.ObjectId;
        firstName: string;
        lastName: string;
        email: string;
        photo?: string;
        profileImg?: string;
        phone?: string;
        batchIds?: Types.ObjectId[];
      };
      return {
        student_id: String(s._id),
        name: `${s.firstName} ${s.lastName}`,
        email: s.email,
        avatar: s.profileImg || null,
        phone: s.phone || '',
        batchIds: s.batchIds ? s.batchIds.map(String) : [],
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
  ) {
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

      const studentBatchIds = student.batchIds
        ? student.batchIds.map(String)
        : [];
      const hasAccess = studentBatchIds.some((id) =>
        allowedBatchIdsSet.has(id),
      );
      if (!hasAccess) {
        throw new ForbiddenException(
          'You do not have permission to access this student',
        );
      }
    }
  }

  async getStudentDetails(userId: string, studentId: string) {
    const callingUser = await this.userModel.findById(userId).lean();
    if (!callingUser) throw new NotFoundException('Calling user not found');

    const student = await this.userModel.findById(studentId).lean();
    if (!student) throw new NotFoundException('Student not found');

    // Secure checking
    await this.checkTeacherStudentAccess(callingUser, student);

    // Resolve course/batch details
    let courseName = 'N/A';
    let batchName = 'N/A';
    let headTeacherName = 'N/A';
    let headTeacherAvatar: string | null = null;
    let categoryName = 'N/A';

    const studentBatchIds = student.batchIds
      ? student.batchIds.map(String)
      : [];

    if (studentBatchIds.length > 0) {
      const course = await this.courseModel
        .findOne({
          'batch._id': { $in: student.batchIds },
        })
        .lean();

      if (course) {
        courseName = course.course_name;
        const b = course.batch.find((b) =>
          b._id ? studentBatchIds.includes(String(b._id)) : false,
        );
        if (b) {
          batchName = b.batchName;
        }

        if (course.head_teacher) {
          const ht = await this.teacherModel
            .findById(course.head_teacher)
            .lean();
          if (ht) {
            const typedHt = ht as unknown as {
              firstName: string;
              lastName: string;
              photo?: string;
            };
            headTeacherName = `${typedHt.firstName} ${typedHt.lastName}`;
            headTeacherAvatar = typedHt.photo || null;
          }
        }

        if (course.category_id) {
          const cat = await this.categoryModel
            .findById(course.category_id)
            .lean();
          if (cat) {
            categoryName = cat.category_name;
          }
        }
      }
    }

    // Progress = completed assignments / total assignments
    let progressPercentage = 60;
    try {
      const AssignmentModel = this.connection.model('Assignment');
      const SubmissionModel = this.connection.model('AssignmentSubmission');

      const totalAssignments = await AssignmentModel.countDocuments({
        batchId: { $in: studentBatchIds },
        status: 'published',
      });

      if (totalAssignments > 0) {
        const completedSubmissions = await SubmissionModel.countDocuments({
          studentId: new Types.ObjectId(studentId),
          status: { $in: ['Submitted', 'Graded'] },
        });
        progressPercentage = Math.round(
          (completedSubmissions / totalAssignments) * 100,
        );
      }
    } catch (err) {
      this.logger.error('Error calculating progress percentage', err);
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
        courseName,
        batchName,
        categoryName,
        headTeacherName,
        headTeacherAvatar,
        courseProgress: `${progressPercentage}%`,
      },
    };
  }

  async getStudentSubmissions(userId: string, studentId: string) {
    const callingUser = await this.userModel.findById(userId).lean();
    if (!callingUser) throw new NotFoundException('Calling user not found');

    const student = await this.userModel.findById(studentId).lean();
    if (!student) throw new NotFoundException('Student not found');

    await this.checkTeacherStudentAccess(callingUser, student);

    const studentBatchIds = student.batchIds
      ? student.batchIds.map(String)
      : [];

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
          const insertRes = await batchesCol.insertOne({
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
      user_name: userName,
    });

    return { status: true, message: 'Review created successfully', data: review };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // COURSE PROGRESS TRACKING
  // ─────────────────────────────────────────────────────────────────────────

  /** Internal helper: compute and persist progress_percent */
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

    // Count total items in this course for this batch
    const [totalLessons, totalSublessons, totalAssignments, totalQuizzes] =
      await Promise.all([
        this.lessonModel.countDocuments({
          course_id: new Types.ObjectId(courseId),
        }),
        this.subLessonModel.countDocuments({
          course_id: new Types.ObjectId(courseId),
        }),
        this.connection
          .collection('assignments')
          .countDocuments({ courseId: new Types.ObjectId(courseId), batchId, status: 'published' }),
        this.connection
          .collection('quizzes')
          .countDocuments({ courseId: new Types.ObjectId(courseId), batchId, status: 'published' }),
      ]);

    const totalItems = totalLessons + totalSublessons + totalAssignments + totalQuizzes;
    if (totalItems === 0) return 0;

    const completedItems =
      progress.completed_lessons.length +
      progress.completed_sublessons.length +
      progress.completed_assignments.length +
      progress.completed_quizzes.length;

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
      { $setOnInsert: { completed_lessons: [], completed_sublessons: [], completed_assignments: [], completed_quizzes: [], progress_percent: 0, completed_at: null } },
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
        completed_lessons: (doc?.completed_lessons || []).map(String),
        completed_sublessons: (doc?.completed_sublessons || []).map(String),
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

  /** POST /auth/course/v1/progress/complete-sublesson */
  async markSublessonComplete(
    studentId: string,
    sublessonId: string,
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
        $addToSet: { completed_sublessons: new Types.ObjectId(sublessonId) },
        $setOnInsert: { completed_lessons: [], completed_assignments: [], completed_quizzes: [], progress_percent: 0, completed_at: null },
      },
      { upsert: true, new: true },
    );

    const percent = await this.recomputeProgress(studentId, courseId, batchId);
    return { status: true, message: 'Sub-lesson marked complete', data: { progress_percent: percent } };
  }
}
