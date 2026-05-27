import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

// ── Batch item embedded in Step 1 ──────────────────────────────────────────
export class BatchItemDto {
  @IsOptional()
  @IsString()
  batchName?: string;

  @IsOptional()
  teacher?: string | null;
}

// ── Create Step 1 — Basic Info ─────────────────────────────────────────────
// Frontend sends: { course_id?, course_name, head_teacher, duration, course_type,
//   course_price, demo_class, category_id, course_schedule, live_classes, batch? }
export class CreateStep1Dto {
  @IsOptional()
  @IsString()
  course_id?: string; // present → upsert; absent → create new

  @IsOptional()
  @IsString()
  organisation_id?: string;

  @IsNotEmpty()
  @IsString()
  course_name: string;

  @IsOptional()
  @IsString()
  head_teacher?: string;

  @IsOptional()
  @IsString()
  duration?: string;

  @IsOptional()
  @IsEnum(['free', 'paid'])
  course_type?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  course_price?: number;

  @IsOptional()
  @IsBoolean()
  demo_class?: boolean;

  @IsOptional()
  @IsString()
  category_id?: string;

  @IsOptional()
  @IsEnum(['morning', 'evening'])
  course_schedule?: string;

  @IsOptional()
  @IsBoolean()
  live_classes?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchItemDto)
  batch?: BatchItemDto[];
}

// ── Create Step 2 — Parsed from FormData 'payload' field ──────────────────
export class CreateStep2Dto {
  @IsNotEmpty()
  @IsString()
  course_id: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  learning_points?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills_you_gain?: string[];
}

// ── Create Step 3 — Description ────────────────────────────────────────────
export class CreateStep3Dto {
  @IsNotEmpty()
  @IsString()
  course_id: string;

  @IsOptional()
  @IsString()
  about_course?: string;

  @IsOptional()
  @IsString()
  instructor_id?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

// ── Create Final Step — Overview ───────────────────────────────────────────
export class CreateFinalStepDto {
  @IsNotEmpty()
  @IsString()
  course_id: string;

  @IsOptional()
  @IsString()
  overview?: string;

  @IsOptional()
  @IsString()
  course_status?: string;
}

// ── Update Step 1 — Same as CreateStep1 but course_id is required ──────────
export class UpdateStep1Dto {
  @IsNotEmpty()
  @IsString()
  course_id: string;

  @IsOptional()
  @IsString()
  course_name?: string;

  @IsOptional()
  @IsString()
  head_teacher?: string;

  @IsOptional()
  @IsString()
  duration?: string;

  @IsOptional()
  @IsString()
  course_type?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  course_price?: number;

  @IsOptional()
  @IsBoolean()
  demo_class?: boolean;

  @IsOptional()
  @IsString()
  category_id?: string;

  @IsOptional()
  @IsString()
  course_schedule?: string;

  @IsOptional()
  @IsBoolean()
  live_classes?: boolean;

  @IsOptional()
  @IsArray()
  batch?: BatchItemDto[];

  @IsOptional()
  @IsString()
  organisation_id?: string;
}

// ── Update Step 2 — Learning Points ────────────────────────────────────────
export class UpdateStep2Dto {
  @IsNotEmpty()
  @IsString()
  course_id: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  learning_points?: string[];
}

// ── Update Step 3 — Skills ─────────────────────────────────────────────────
export class UpdateStep3Dto {
  @IsNotEmpty()
  @IsString()
  course_id: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills_you_gain?: string[];

  @IsOptional()
  @IsString()
  category_id?: string;
}

// ── Update Step 4 — About ─────────────────────────────────────────────────
export class UpdateStep4Dto {
  @IsNotEmpty()
  @IsString()
  course_id: string;

  @IsOptional()
  @IsString()
  about_course?: string;
}

// ── Update Step 5 — Teacher/Description ───────────────────────────────────
export class UpdateStep5Dto {
  @IsNotEmpty()
  @IsString()
  course_id: string;

  @IsOptional()
  @IsString()
  instructor_id?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

// ── Update Step 6 — Overview ──────────────────────────────────────────────
export class UpdateStep6Dto {
  @IsNotEmpty()
  @IsString()
  course_id: string;

  @IsOptional()
  @IsString()
  overview?: string;
}

// ── Update Course Status ──────────────────────────────────────────────────
export class UpdateCourseStatusDto {
  @IsNotEmpty()
  @IsString()
  course_id: string;

  @IsOptional()
  @IsString()
  course_name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty()
  @IsEnum(['published', 'unpublished', 'draft'])
  status: string;
}

// ── Lesson DTOs ───────────────────────────────────────────────────────────
// Frontend FormData fields: lessonData (JSON string) + photo (file)
export class CreateLessonDto {
  @IsNotEmpty()
  @IsString()
  course_id: string;

  @IsNotEmpty()
  @IsString()
  lesson_name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  unlock_after_previous?: boolean;
}

// Frontend FormData fields: data (JSON string) + photo (file)
export class UpdateLessonDto {
  @IsNotEmpty()
  @IsString()
  course_id: string;

  @IsNotEmpty()
  @IsString()
  lesson_id: string;

  @IsOptional()
  @IsString()
  lesson_name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  unlock_after_previous?: boolean;
}

// ── SubLesson DTOs ────────────────────────────────────────────────────────
// Frontend FormData: data (JSON string) + photo (file)
export class CreateSubLessonDto {
  @IsNotEmpty()
  @IsString()
  course_id: string;

  @IsNotEmpty()
  @IsString()
  lesson_id: string;

  @IsNotEmpty()
  @IsString()
  Sublesson_name: string; // exact frontend key name (capital S)

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateSubLessonDto {
  @IsNotEmpty()
  @IsString()
  course_id: string;

  @IsNotEmpty()
  @IsString()
  lesson_id: string;

  @IsNotEmpty()
  @IsString()
  sublesson_id: string;

  @IsOptional()
  @IsString()
  Sublesson_name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
