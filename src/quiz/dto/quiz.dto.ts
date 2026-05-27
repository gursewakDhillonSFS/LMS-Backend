import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// ─── Question DTOs ────────────────────────────────────────────────────────────

export class McqQuestionDto {
  @IsNotEmpty()
  @IsString()
  question: string;

  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  options: string[];

  @IsNotEmpty()
  @IsString()
  correctOption: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  marks: number;
}

export class EssayQuestionDto {
  @IsNotEmpty()
  @IsString()
  question: string;

  @IsNotEmpty()
  @IsString()
  correctAnswer: string; // Auto-evaluated via lowercase compare

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  marks: number;
}

export class QuizQuestionDto {
  @IsNotEmpty()
  @IsEnum(['mcq', 'essay'])
  questionType: 'mcq' | 'essay';

  @IsNotEmpty()
  @IsString()
  question: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  marks: number;

  // MCQ fields
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsString()
  correctOption?: string;

  // Essay fields
  @IsOptional()
  @IsString()
  correctAnswer?: string;
}

// ─── Create Quiz DTO ──────────────────────────────────────────────────────────

export class CreateQuizDto {
  @IsNotEmpty()
  @IsString()
  quizName: string;

  @IsNotEmpty()
  @IsDateString()
  dueDate: string;

  @IsNotEmpty()
  @IsEnum(['essay', 'mcq', 'mixed'])
  quizType: string;

  @IsNotEmpty()
  @IsString()
  overview: string;

  @IsOptional()
  @IsBoolean()
  enableTimer?: boolean;

  @IsOptional()
  @IsString()
  timer?: string;

  @IsNotEmpty()
  @IsMongoId()
  courseId: string;

  @IsNotEmpty()
  @IsString()
  batchId: string;

  @IsOptional()
  @IsMongoId()
  organisationId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizQuestionDto)
  questions?: QuizQuestionDto[];

  @IsOptional()
  @IsEnum(['published', 'draft'])
  status?: string;
}

// ─── Update Quiz DTO ──────────────────────────────────────────────────────────

export class UpdateQuizDto {
  @IsOptional()
  @IsString()
  quizName?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsEnum(['essay', 'mcq', 'mixed'])
  quizType?: string;

  @IsOptional()
  @IsString()
  overview?: string;

  @IsOptional()
  @IsBoolean()
  enableTimer?: boolean;

  @IsOptional()
  @IsString()
  timer?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizQuestionDto)
  questions?: QuizQuestionDto[];

  @IsOptional()
  @IsEnum(['published', 'draft'])
  status?: string;
}

// ─── Grade Submission DTO ─────────────────────────────────────────────────────

export class GradeQuizSubmissionDto {
  @IsNotEmpty()
  @IsMongoId()
  submissionId: string;

  @IsOptional()
  @IsString()
  feedback?: string;
}
