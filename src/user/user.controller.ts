import {
  Controller,
  Post,
  Get,
  Patch,
  Put,
  Body,
  Param,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserService } from './user.service';
import {
  CreateUserDto,
  LoginDto,
  ForgotPasswordDto,
  VerifyOtpDto,
  ResetPasswordDto,
  ChangePasswordDto,
  OAuthLoginDto,
  UpdateProfileDto,
} from './dto/create-user.dto';
import {
  OnboardingCareerDto,
  OnboardingTopicsDto,
  OnboardingEducationDto,
} from './dto/onboarding.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InstructorOnlyGuard } from '../auth/instructor-only.guard';

@Controller('auth/user/v1')
export class UserController {
  constructor(private readonly userService: UserService) {}

  // ─── Public Routes ───────────────────────────────────────────────────────────

  @Post('create')
  create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.userService.login(dto);
  }

  @Post('auth/oauth-login-signup')
  oauthLogin(@Body() dto: OAuthLoginDto) {
    return this.userService.oauthLogin(dto);
  }

  @Post('forget-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.userService.forgotPassword(dto);
  }

  @Post('verify-otp')
  verifyOtp(@Body() dto: VerifyOtpDto, @Request() req) {
    // userId passed as query or from body context
    const userId = req.body.user_id;
    return this.userService.verifyOtp(userId, dto);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.userService.resetPassword(dto);
  }

  // ─── Authenticated Routes ─────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@Request() req) {
    return this.userService.getProfile(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Put('change-password')
  changePassword(@Body() dto: ChangePasswordDto, @Request() req) {
    return this.userService.changePassword(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('user-onboarding/career')
  onboardingCareer(@Body() dto: OnboardingCareerDto, @Request() req) {
    return this.userService.onboardingCareer(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('user-onboarding/topics')
  onboardingTopics(@Body() dto: OnboardingTopicsDto, @Request() req) {
    return this.userService.onboardingTopics(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('user-onboarding/education-level')
  onboardingEducation(@Body() dto: OnboardingEducationDto, @Request() req) {
    return this.userService.onboardingEducation(req.user.userId, dto);
  }



  @UseGuards(JwtAuthGuard)
  @Patch('update-profile')
  @UseInterceptors(FileInterceptor('photo'))
  updateProfile(
    @Body() dto: UpdateProfileDto,
    @Request() req,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.userService.updateProfile(req.user.userId, dto, file);
  }

  @UseGuards(JwtAuthGuard, InstructorOnlyGuard)
  @Get('seed/student-sandbox')
  async seedStudentSandbox() {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Sandbox seeding is disabled in production');
    }
    return this.userService.seedStudentSandbox();
  }
}
