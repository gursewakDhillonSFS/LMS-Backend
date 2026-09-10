import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

// ─── Registration ─────────────────────────────────────────────────────────────
// Field names match exactly what the frontend sends
export class CreateUserDto {
  @IsNotEmpty()
  @IsString()
  first_name: string;

  @IsNotEmpty()
  @IsString()
  last_name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  password_hash: string;

  // "student" | "instructor" — maps to UserRole in the service
  @IsOptional()
  @IsString()
  signup_type?: string;
}

// ─── Login ────────────────────────────────────────────────────────────────────
export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsNotEmpty()
  @IsString()
  password: string;
}

// ─── Forgot Password ─────────────────────────────────────────────────────────
export class ForgotPasswordDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

// ─── Verify OTP ──────────────────────────────────────────────────────────────
export class VerifyOtpDto {
  @IsNotEmpty()
  @IsString()
  otp: string;

  @IsOptional()
  @IsString()
  user_id?: string;
}

// ─── Reset Password ──────────────────────────────────────────────────────────
export class ResetPasswordDto {
  @IsNotEmpty()
  @IsString()
  token: string;

  @IsNotEmpty()
  @IsString()
  user_id: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  new_password: string;

  @IsNotEmpty()
  @IsString()
  re_enter_new_password: string;
}

// ─── Change Password ─────────────────────────────────────────────────────────
export class ChangePasswordDto {
  @IsNotEmpty()
  @IsString()
  current_password: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  new_password: string;
}

// ─── OAuth Login ─────────────────────────────────────────────────────────────
export class OAuthLoginDto {
  @IsNotEmpty()
  @IsString()
  token: string;

  @IsNotEmpty()
  @IsString()
  provider: string;

  @IsOptional()
  @IsString()
  role_name?: string;
}

// ─── Update Profile ───────────────────────────────────────────────────────────
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  preferredLanguage?: 'en' | 'pa' | 'fr';
}
