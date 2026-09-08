import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCheckoutSessionDto {
  @IsArray()
  @IsNotEmpty()
  @IsString({ each: true })
  course_ids: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  batch_ids?: string[];
}
