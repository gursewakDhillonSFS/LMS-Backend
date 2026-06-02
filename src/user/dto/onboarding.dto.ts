import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Frontend sends: { user_id, career }
export class OnboardingCareerDto {
  @IsOptional()
  @IsString()
  career?: string;

  @IsOptional()
  @IsString()
  user_id?: string;
}

// Frontend sends: { user_id, topic: ["Graphic Design"] }  ← topic (singular)
export class OnboardingTopicsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  topic?: string[]; // ← matches frontend key exactly

  @IsOptional()
  @IsString()
  user_id?: string;
}

// Frontend sends: { user_id, education_level: "..." }  ← snake_case
export class OnboardingEducationDto {
  @IsOptional()
  @IsString()
  education_level?: string; // ← matches frontend key exactly

  @IsOptional()
  @IsString()
  user_id?: string;
}

export class OnboardingSubscriptionDto {
  @IsOptional()
  plan?: string;
}
