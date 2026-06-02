import {
  IsArray,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ProjectDto {
  @IsNotEmpty()
  @IsString()
  projectName: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  objectives?: string[];

  @IsOptional()
  enableButton?: boolean;
}

export class CreateAssignmentDto {
  @IsNotEmpty()
  @IsString()
  assignmentName: string;

  @IsNotEmpty()
  @IsDateString()
  dueDate: string;

  @IsNotEmpty()
  @IsString()
  overview: string;

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
  @Type(() => ProjectDto)
  projects?: ProjectDto[];

  @IsOptional()
  @IsEnum(['published', 'draft'])
  status?: string;
}

export class UpdateAssignmentDto {
  @IsOptional()
  @IsString()
  assignmentName?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  overview?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectDto)
  projects?: ProjectDto[];

  @IsOptional()
  @IsEnum(['published', 'draft'])
  status?: string;
}

export class GradeSubmissionDto {
  @IsNotEmpty()
  @IsMongoId()
  submissionId: string;

  @IsOptional()
  @IsString()
  result?: string;

  @IsOptional()
  @IsString()
  feedback?: string;
}
