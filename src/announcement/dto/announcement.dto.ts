import {
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateAnnouncementDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsString()
  message: string;

  @IsNotEmpty()
  @IsMongoId()
  courseId: string;

  @IsOptional()
  @IsString()
  batchId?: string;

  @IsOptional()
  @IsEnum(['published', 'draft'])
  status?: string;

  @IsOptional()
  @IsString()
  scheduledAt?: string; // Date string: YYYY-MM-DD or date-only
}

export class UpdateAnnouncementDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsEnum(['published', 'draft'])
  status?: string;

  @IsOptional()
  @IsString()
  scheduledAt?: string;
}
