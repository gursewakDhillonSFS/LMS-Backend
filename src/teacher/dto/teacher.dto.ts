import {
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateTeacherDto {
  @IsNotEmpty()
  @IsString()
  First_name: string; // matches frontend key

  @IsNotEmpty()
  @IsString()
  Last_name: string; // matches frontend key

  @IsOptional()
  @IsEnum(['Male', 'Female', 'Other'])
  gender?: string;

  @IsOptional()
  @IsString()
  dob?: string;

  @IsOptional()
  @IsEnum(['Single', 'Married', 'Divorced'])
  marital_status?: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsOptional()
  @IsString()
  phone_number?: string;

  @IsOptional()
  @IsString()
  qualification?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  expert_in?: string[];

  @IsOptional()
  @IsString()
  user_id?: string;
}

export class UpdateTeacherDto {
  @IsOptional()
  @IsString()
  First_name?: string;

  @IsOptional()
  @IsString()
  Last_name?: string;

  @IsOptional()
  @IsEnum(['Male', 'Female', 'Other'])
  gender?: string;

  @IsOptional()
  @IsString()
  dob?: string;

  @IsOptional()
  @IsEnum(['Single', 'Married', 'Divorced'])
  marital_status?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone_number?: string;

  @IsOptional()
  @IsString()
  qualification?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  expert_in?: string[];
}
