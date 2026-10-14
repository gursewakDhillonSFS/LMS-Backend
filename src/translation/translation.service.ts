import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { Course, CourseDocument } from '../course/schemas/course.schema';
import { Lesson, LessonDocument } from '../course/schemas/lesson.schema';
import {
  SubLesson,
  SubLessonDocument,
} from '../course/schemas/sublesson.schema';
import {
  CourseTranslation,
  CourseTranslationDocument,
} from '../course/schemas/course-translation.schema';
import {
  LessonTranslation,
  LessonTranslationDocument,
} from '../course/schemas/lesson-translation.schema';
import {
  SubLessonTranslation,
  SubLessonTranslationDocument,
} from '../course/schemas/sublesson-translation.schema';
import { CompositeTranslationProvider } from './providers/composite.provider';
import { TranslationQueueService } from './translation-queue.service';
import {
  preferTranslation,
  preferTranslationList,
} from './translation-text.util';

@Injectable()
export class TranslationService implements OnModuleInit {
  private readonly logger = new Logger(TranslationService.name);

  constructor(
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
    @InjectModel(Lesson.name)
    private readonly lessonModel: Model<LessonDocument>,
    @InjectModel(SubLesson.name)
    private readonly subLessonModel: Model<SubLessonDocument>,
    @InjectModel(CourseTranslation.name)
    private readonly courseTranslationModel: Model<CourseTranslationDocument>,
    @InjectModel(LessonTranslation.name)
    private readonly lessonTranslationModel: Model<LessonTranslationDocument>,
    @InjectModel(SubLessonTranslation.name)
    private readonly subLessonTranslationModel: Model<SubLessonTranslationDocument>,
    private readonly provider: CompositeTranslationProvider,
    private readonly queueService: TranslationQueueService,
  ) {}

  onModuleInit(): void {
    this.queueService.registerExecutor(
      async (courseId: string, targetLocale: string) => {
        await this.executeCourseTranslation(courseId, targetLocale);
      },
    );
  }

  /**
   * Generates a hash of the translatable course content to detect changes
   */
  computeContentHash(data: {
    course_name?: string;
    about_course?: string | null;
    description?: string | null;
    overview?: string | null;
    learning_points?: string[];
    skills_you_gain?: string[];
  }): string {
    const serialized = JSON.stringify({
      name: data.course_name || '',
      about: data.about_course || '',
      desc: data.description || '',
      overview: data.overview || '',
      points: data.learning_points || [],
      skills: data.skills_you_gain || [],
    });
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }

  /**
   * Core translation execution for a course into a target locale
   */
  async executeCourseTranslation(
    courseId: string,
    targetLocale: string,
    force = false,
  ): Promise<void> {
    if (targetLocale === 'en') return;

    const course = await this.courseModel.findById(courseId);
    if (!course) {
      throw new NotFoundException(`Course ${courseId} not found`);
    }

    const currentHash = this.computeContentHash({
      course_name: course.course_name,
      about_course: course.about_course,
      description: course.description,
      overview: course.overview,
      learning_points: course.learning_points,
      skills_you_gain: course.skills_you_gain,
    });

    // Check existing translation
    const existing = await this.courseTranslationModel.findOne({
      course_id: course._id,
      locale: targetLocale,
    });

    // Respect manually edited translations unless force = true
    if (existing && existing.source === 'manually_edited' && !force) {
      this.logger.log(
        `Skipping automatic translation for course ${courseId} (${targetLocale}): translation was manually edited`,
      );
      return;
    }

    // Skip if content has not changed and is already completed
    if (
      existing &&
      existing.content_hash === currentHash &&
      existing.status === 'completed' &&
      !force
    ) {
      this.logger.log(
        `Content hash identical for course ${courseId} (${targetLocale}), skipping redundant translation`,
      );
      return;
    }

    this.logger.log(
      `Starting translation for Course "${course.course_name}" -> [${targetLocale}]`,
    );

    // Translate course metadata
    const [translatedName, translatedAbout, translatedDesc, translatedOverview] =
      await Promise.all([
        this.provider.translate(course.course_name, 'en', targetLocale),
        course.about_course
          ? this.provider.translate(course.about_course, 'en', targetLocale)
          : Promise.resolve(null),
        course.description
          ? this.provider.translate(course.description, 'en', targetLocale)
          : Promise.resolve(null),
        course.overview
          ? this.provider.translate(course.overview, 'en', targetLocale)
          : Promise.resolve(null),
      ]);

    // Translate string arrays
    const translatedLearningPoints =
      course.learning_points && course.learning_points.length > 0
        ? await this.provider.translateBatch(
            course.learning_points,
            'en',
            targetLocale,
          )
        : [];

    const translatedSkills =
      course.skills_you_gain && course.skills_you_gain.length > 0
        ? await this.provider.translateBatch(
            course.skills_you_gain,
            'en',
            targetLocale,
          )
        : [];

    // Save CourseTranslation
    await this.courseTranslationModel.findOneAndUpdate(
      { course_id: course._id, locale: targetLocale },
      {
        $set: {
          course_name: preferTranslation(translatedName, course.course_name),
          about_course: preferTranslation(translatedAbout, course.about_course),
          description: preferTranslation(translatedDesc, course.description),
          overview: preferTranslation(translatedOverview, course.overview),
          learning_points: preferTranslationList(
            translatedLearningPoints,
            course.learning_points,
          ),
          skills_you_gain: preferTranslationList(
            translatedSkills,
            course.skills_you_gain,
          ),
          status: 'completed',
          source: 'machine_generated',
          content_hash: currentHash,
          error_message: null,
          translated_at: new Date(),
        },
      },
      { upsert: true, new: true },
    );

    // Also translate associated lessons & sublessons
    await this.translateLessonsForCourse(course._id, targetLocale);

    this.logger.log(
      `Completed course & lesson translation for "${course.course_name}" -> [${targetLocale}]`,
    );
  }

  /**
   * Translates lessons and sublessons belonging to a course
   */
  async translateLessonsForCourse(
    courseId: Types.ObjectId,
    targetLocale: string,
  ): Promise<void> {
    const lessons = await this.lessonModel.find({ course_id: courseId }).lean();
    for (const l of lessons) {
      const existingLesson = await this.lessonTranslationModel.findOne({
        lesson_id: l._id,
        locale: targetLocale,
      });

      if (!existingLesson || existingLesson.source !== 'manually_edited') {
        const [lName, lDesc] = await Promise.all([
          this.provider.translate(l.lesson_name, 'en', targetLocale),
          l.lesson_description
            ? this.provider.translate(l.lesson_description, 'en', targetLocale)
            : Promise.resolve(null),
        ]);

        await this.lessonTranslationModel.findOneAndUpdate(
          { lesson_id: l._id, locale: targetLocale },
          {
            $set: {
              course_id: courseId,
              lesson_name: preferTranslation(lName, l.lesson_name),
              lesson_description: preferTranslation(lDesc, l.lesson_description),
              status: 'completed',
              source: 'machine_generated',
              translated_at: new Date(),
            },
          },
          { upsert: true },
        );
      }

      // Translate sublessons for this lesson
      const sublessons = await this.subLessonModel
        .find({ lesson_id: l._id })
        .lean();
      for (const s of sublessons) {
        const existingSub = await this.subLessonTranslationModel.findOne({
          sublesson_id: s._id,
          locale: targetLocale,
        });

        if (!existingSub || existingSub.source !== 'manually_edited') {
          const [sName, sDesc] = await Promise.all([
            this.provider.translate(s.sublesson_name, 'en', targetLocale),
            s.sublesson_description
              ? this.provider.translate(
                  s.sublesson_description,
                  'en',
                  targetLocale,
                )
              : Promise.resolve(null),
          ]);

          await this.subLessonTranslationModel.findOneAndUpdate(
            { sublesson_id: s._id, locale: targetLocale },
            {
              $set: {
                course_id: courseId,
                lesson_id: l._id,
                sublesson_name: preferTranslation(sName, s.sublesson_name),
                sublesson_description: preferTranslation(
                  sDesc,
                  s.sublesson_description,
                ),
                status: 'completed',
                source: 'machine_generated',
                translated_at: new Date(),
              },
            },
            { upsert: true },
          );
        }
      }
    }
  }

  /**
   * Retrieves all translations and status for a given course
   */
  async getCourseTranslations(courseId: string) {
    const course = await this.courseModel.findById(courseId).lean();
    if (!course) throw new NotFoundException('Course not found');

    const translations = await this.courseTranslationModel
      .find({ course_id: new Types.ObjectId(courseId) })
      .lean();

    const jobStatuses = await this.queueService.getCourseJobStatuses(courseId);

    const paTranslation = translations.find((t) => t.locale === 'pa');
    const frTranslation = translations.find((t) => t.locale === 'fr');

    return {
      status: true,
      data: {
        course_id: courseId,
        en: {
          locale: 'en',
          course_name: course.course_name,
          about_course: course.about_course,
          description: course.description,
          overview: course.overview,
          learning_points: course.learning_points || [],
          skills_you_gain: course.skills_you_gain || [],
          status: 'completed',
          source: 'original',
        },
        pa: {
          locale: 'pa',
          course_name: paTranslation?.course_name || null,
          about_course: paTranslation?.about_course || null,
          description: paTranslation?.description || null,
          overview: paTranslation?.overview || null,
          learning_points: paTranslation?.learning_points || [],
          skills_you_gain: paTranslation?.skills_you_gain || [],
          status: paTranslation?.status || jobStatuses.pa?.status || 'pending',
          source: paTranslation?.source || 'machine_generated',
          translated_at: paTranslation?.translated_at || null,
        },
        fr: {
          locale: 'fr',
          course_name: frTranslation?.course_name || null,
          about_course: frTranslation?.about_course || null,
          description: frTranslation?.description || null,
          overview: frTranslation?.overview || null,
          learning_points: frTranslation?.learning_points || [],
          skills_you_gain: frTranslation?.skills_you_gain || [],
          status: frTranslation?.status || jobStatuses.fr?.status || 'pending',
          source: frTranslation?.source || 'machine_generated',
          translated_at: frTranslation?.translated_at || null,
        },
      },
    };
  }

  /**
   * Allows instructors to manually edit a translation
   */
  async updateManualTranslation(
    courseId: string,
    locale: string,
    dto: {
      course_name?: string;
      about_course?: string;
      description?: string;
      overview?: string;
      learning_points?: string[];
      skills_you_gain?: string[];
    },
  ) {
    if (!['pa', 'fr'].includes(locale)) {
      throw new Error(`Manual translation editing only supports 'pa' and 'fr'`);
    }

    const course = await this.courseModel.findById(courseId);
    if (!course) throw new NotFoundException('Course not found');

    const updatePayload: Record<string, any> = {
      source: 'manually_edited',
      status: 'completed',
      translated_at: new Date(),
    };

    if (dto.course_name !== undefined) updatePayload.course_name = dto.course_name;
    if (dto.about_course !== undefined)
      updatePayload.about_course = dto.about_course;
    if (dto.description !== undefined) updatePayload.description = dto.description;
    if (dto.overview !== undefined) updatePayload.overview = dto.overview;
    if (dto.learning_points !== undefined)
      updatePayload.learning_points = dto.learning_points;
    if (dto.skills_you_gain !== undefined)
      updatePayload.skills_you_gain = dto.skills_you_gain;

    const updated = await this.courseTranslationModel.findOneAndUpdate(
      { course_id: new Types.ObjectId(courseId), locale },
      { $set: updatePayload },
      { upsert: true, new: true },
    );

    return {
      status: true,
      message: `Manual translation updated for [${locale}]`,
      data: updated,
    };
  }

  /**
   * Marks translations outdated and re-enqueues jobs when English course changes
   */
  async onCourseUpdated(courseId: string): Promise<void> {
    await this.courseTranslationModel.updateMany(
      {
        course_id: new Types.ObjectId(courseId),
        source: 'machine_generated',
      },
      { $set: { status: 'outdated' } },
    );

    await this.queueService.enqueueCourseTranslation(courseId, ['pa', 'fr']);
  }

  /**
   * Enqueues translation for all existing published courses in database
   */
  async bulkEnqueueAllCourses(force = false): Promise<number> {
    const courses = await this.courseModel
      .find({ course_status: 'published' }, { _id: 1 })
      .lean();
    for (const course of courses) {
      await this.queueService.enqueueCourseTranslation(
        course._id.toString(),
        ['pa', 'fr'],
        force,
      );
    }
    return courses.length;
  }
}
