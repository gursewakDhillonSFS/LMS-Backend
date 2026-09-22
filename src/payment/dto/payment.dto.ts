import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
} from 'class-validator';

/**
 * DTO for initiating a single-course purchase checkout session.
 * The frontend only sends courseId and optionally batchId.
 * Price, platform fee, and all financial values are calculated server-side.
 */
export class PurchaseCourseDto {
  @IsNotEmpty()
  @IsString()
  course_id: string;

  @IsOptional()
  @IsString()
  batch_id?: string;

  @IsOptional()
  use_saved_payment_method?: boolean;

  @IsOptional()
  @IsString()
  payment_method_id?: string;
}

/**
 * Legacy DTO – kept for backward compatibility during migration.
 * Will be removed once all frontends switch to single-course purchase.
 */
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

/**
 * DTO for requesting a refund. Admin only.
 */
export class RefundPurchaseDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
