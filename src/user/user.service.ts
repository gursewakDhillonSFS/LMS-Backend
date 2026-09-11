import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import * as nodemailer from 'nodemailer';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import {
  User,
  UserDocument,
  UserRole,
  OnboardingStatus,
  AuthProvider,
} from './schemas/user.schema';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
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

@Injectable()
export class UserService {
  private googleClient: OAuth2Client;

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private cloudinary: CloudinaryService,
    @InjectConnection() private connection: Connection,
  ) {
    this.googleClient = new OAuth2Client(
      this.configService.get('GOOGLE_CLIENT_ID'),
    );
  }

  private generateToken(user: UserDocument) {
    const payload = {
      sub: user._id,
      email: user.email,
      role: user.role,
      onboardingStatus: user.onboardingStatus,
    };
    return this.jwtService.sign(payload);
  }

  private buildUserResponse(
    user: UserDocument,
    token: string,
    message = 'Success',
  ) {
    return {
      status: true,
      message,
      data: {
        // ── Identity ──────────────────────────────────────────────────────────
        user_id: user._id,
        email: user.email,
        first_name: user.firstName,
        last_name: user.lastName,
        full_name: `${user.firstName} ${user.lastName}`,
        profile_img: user.profileImg ?? null,
        role_name: user.role, // "student" | "instructor"

        // ── Auth token ────────────────────────────────────────────────────────
        access_token: token,

        // ── Onboarding progress (null = not yet completed) ────────────────────
        career: user.career ?? null,
        topics: user.topics?.length ? user.topics : null,
        education_level: user.educationLevel ?? null,

        // ── Organisation & instructor linking ─────────────────────────────────
        organization_id: user.organisationId ?? null,
        instructor_id: user.teacherId ?? null,
        preferred_language: (user as any).preferredLanguage || 'en',
      },
    };
  }

  async create(dto: CreateUserDto) {
    const existing = await this.userModel.findOne({
      email: dto.email.toLowerCase(),
    });
    if (existing) throw new ConflictException('Email already registered');

    const hashed = await bcrypt.hash(dto.password_hash, 10);
    const role =
      dto.signup_type === 'instructor' ? UserRole.INSTRUCTOR : UserRole.STUDENT;

    const user = await this.userModel.create({
      firstName: dto.first_name,
      lastName: dto.last_name,
      email: dto.email.toLowerCase(),
      password: hashed,
      role,
    });

    const token = this.generateToken(user);
    return this.buildUserResponse(user, token, 'Account created successfully');
  }

  async login(dto: LoginDto) {
    const user = await this.userModel.findOne({
      email: dto.email.toLowerCase(),
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.password)
      throw new UnauthorizedException('Please use Google sign-in');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const token = this.generateToken(user);
    return this.buildUserResponse(user, token, 'Login successful');
  }

  async oauthLogin(dto: OAuthLoginDto) {
    let email: string;
    let firstName: string;
    let lastName: string;
    let profileImg: string | null = null;

    if (dto.provider === 'google') {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: dto.token,
        audience: this.configService.get('GOOGLE_CLIENT_ID'),
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        throw new BadRequestException('Invalid Google token');
      }
      email = payload.email.toLowerCase();
      firstName = payload.given_name || '';
      lastName = payload.family_name || '';
      profileImg = payload.picture ?? null;
    } else {
      throw new BadRequestException('Unsupported OAuth provider');
    }

    let user = await this.userModel.findOne({ email });
    if (!user) {
      const role =
        dto.role_name === 'instructor' ? UserRole.INSTRUCTOR : UserRole.STUDENT;
      user = await this.userModel.create({
        email,
        firstName,
        lastName,
        profileImg,
        provider: AuthProvider.GOOGLE,
        role,
      });
    }

    const token = this.generateToken(user);
    return this.buildUserResponse(user, token, 'Login successful');
  }

  async onboardingCareer(userId: string, dto: OnboardingCareerDto) {
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { career: dto.career },
      { new: true },
    );
    if (!user) throw new NotFoundException('User not found');
    const token = this.generateToken(user);
    return this.buildUserResponse(user, token, 'Career updated');
  }

  async onboardingTopics(userId: string, dto: OnboardingTopicsDto) {
    // Frontend sends 'topic' (singular) not 'topics'
    const topics = dto.topic ?? [];
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { topics },
      { new: true },
    );
    if (!user) throw new NotFoundException('User not found');
    const token = this.generateToken(user);
    return this.buildUserResponse(user, token, 'Topics updated');
  }

  async onboardingEducation(userId: string, dto: OnboardingEducationDto) {
    // Frontend sends 'education_level' (snake_case)
    const educationLevel = dto.education_level;
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { educationLevel, onboardingStatus: OnboardingStatus.COMPLETE },
      { new: true },
    );
    if (!user) throw new NotFoundException('User not found');
    const token = this.generateToken(user);
    return this.buildUserResponse(
      user,
      token,
      'Education level updated, onboarding complete',
    );
  }



  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.userModel.findOne({
      email: dto.email.toLowerCase(),
    });
    if (!user) throw new NotFoundException('No account found with this email');

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await this.userModel.findByIdAndUpdate(user._id, {
      resetOtp: otp,
      resetOtpExpiry: expiry,
    });

    // Send email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: this.configService.get('EMAIL_USER'),
        pass: this.configService.get('EMAIL_PASS'),
      },
    });

    try {
      await transporter.sendMail({
        from: `"LMS Platform" <${this.configService.get('EMAIL_USER')}>`,
        to: user.email,
        subject: 'Password Reset OTP',
        html: `<h2>Your OTP: <strong>${otp}</strong></h2><p>Valid for 10 minutes.</p>`,
      });
    } catch (e) {
      // If email fails in dev, return OTP directly
      console.warn('Email send failed (dev mode):', e.message);
      return { success: true, message: 'OTP generated', otp, userId: user._id };
    }

    return { success: true, message: 'OTP sent to email', userId: user._id };
  }

  async verifyOtp(userId: string, dto: VerifyOtpDto) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (!user.resetOtp || user.resetOtp !== dto.otp) {
      throw new BadRequestException('Invalid OTP');
    }
    if (user.resetOtpExpiry && new Date() > user.resetOtpExpiry) {
      throw new BadRequestException('OTP has expired');
    }
    // Generate a short-lived reset token
    const resetToken = this.jwtService.sign(
      { sub: user._id, purpose: 'reset' },
      { expiresIn: '15m' },
    );
    return { success: true, message: 'OTP verified', token: resetToken };
  }

  async resetPassword(dto: ResetPasswordDto) {
    if (dto.new_password !== dto.re_enter_new_password) {
      throw new BadRequestException('Passwords do not match');
    }
    let decoded: { purpose?: string; sub?: string };
    try {
      decoded = this.jwtService.verify<{ purpose?: string; sub?: string }>(dto.token);
    } catch {
      throw new BadRequestException('Invalid or expired reset token');
    }
    if (decoded.purpose !== 'reset')
      throw new BadRequestException('Invalid token');

    if (!decoded.sub || String(decoded.sub) !== String(dto.user_id)) {
      throw new BadRequestException('Token does not match the target user');
    }

    const hashed = await bcrypt.hash(dto.new_password, 10);
    await this.userModel.findByIdAndUpdate(dto.user_id, {
      password: hashed,
      resetOtp: null,
      resetOtpExpiry: null,
    });
    return { success: true, message: 'Password reset successfully' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const currentPassword = dto.current_password || (dto as unknown as { old_password?: string }).old_password;
    if (!currentPassword) {
      throw new BadRequestException('Current password is required');
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw new BadRequestException('Current password is incorrect');

    const hashed = await bcrypt.hash(dto.new_password, 10);
    await this.userModel.findByIdAndUpdate(userId, { password: hashed });
    return { success: true, message: 'Password changed successfully' };
  }

  async getProfile(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('-password -resetOtp -resetOtpExpiry');
    if (!user) throw new NotFoundException('User not found');
    const token = this.generateToken(user);
    return this.buildUserResponse(user, token, 'Profile fetched');
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
    file?: Express.Multer.File,
  ) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    let profileImgUrl = user.profileImg;
    if (file && file.size > 0) {
      const uploaded = await this.cloudinary.uploadFile(file, 'lms/avatars');
      profileImgUrl = uploaded.secure_url;
    }

    const updatedUser = await this.userModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          firstName: dto.firstName ?? user.firstName,
          lastName: dto.lastName ?? user.lastName,
          profileImg: profileImgUrl,
          ...(dto.preferredLanguage ? { preferredLanguage: dto.preferredLanguage } : {}),
        },
      },
      { new: true },
    );

    if (!updatedUser) throw new NotFoundException('User not found');

    // Sync with the Teacher collection ONLY if this user has their own matching teacher profile
    if (updatedUser.teacherId) {
      await this.connection.collection('teachers').updateOne(
        {
          _id: new Types.ObjectId(String(updatedUser.teacherId)),
          email: updatedUser.email.toLowerCase(),
        },
        {
          $set: {
            firstName: updatedUser.firstName,
            lastName: updatedUser.lastName,
            photo: updatedUser.profileImg,
          },
        }
      );
    }

    const token = this.generateToken(updatedUser);
    return this.buildUserResponse(
      updatedUser,
      token,
      'Profile updated successfully',
    );
  }

  async seedStudentSandbox() {
    const db = this.connection;
    const usersCol = db.collection('users');
    const orgsCol = db.collection('organisations');
    const teachersCol = db.collection('teachers');
    const categoriesCol = db.collection('categories');
    const coursesCol = db.collection('courses');
    const batchesCol = db.collection('batches');
    const enrollmentsCol = db.collection('batch_enrolled_students');
    const lessonsCol = db.collection('lessons');
    const sublessonsCol = db.collection('sublessons');
    const assignmentsCol = db.collection('assignments');
    const quizzesCol = db.collection('quizzes');
    const liveClassesCol = db.collection('live_classes');
    const schedulesCol = db.collection('schedules');
    const cartsCol = db.collection('carts');
    const chatGroupsCol = db.collection('chat_groups');
    const chatMessagesCol = db.collection('chat_messages');

    // ─── 1. Clean Up Seed Targets ──────────────────────────────────────────
    const studentEmail = 'student@sandbox.com';
    const instructorEmail = 'instructor@sandbox.com';
    await usersCol.deleteMany({
      email: { $in: [studentEmail, instructorEmail] },
    });
    await orgsCol.deleteMany({ email: 'info@sandboxacademy.com' });
    await teachersCol.deleteMany({ email: instructorEmail });

    // Consistent ObjectIds
    const orgId = new Types.ObjectId('65ef8c8a1b2c3d4e5f6a7b8c');
    const instructorId = new Types.ObjectId('65ef8c8a1b2c3d4e5f6a7b8d');
    const teacherProfileId = new Types.ObjectId('65ef8c8a1b2c3d4e5f6a7b8e');
    const studentId = new Types.ObjectId('65ef8c8a1b2c3d4e5f6a7b8f');

    const catDevId = new Types.ObjectId('65ef8c8a1b2c3d4e5f6a7b90');
    const catDesignId = new Types.ObjectId('65ef8c8a1b2c3d4e5f6a7b91');

    const course1Id = new Types.ObjectId('65ef8c8a1b2c3d4e5f6a7b92');
    const course2Id = new Types.ObjectId('65ef8c8a1b2c3d4e5f6a7b93');
    const course3Id = new Types.ObjectId('65ef8c8a1b2c3d4e5f6a7b94');

    const batch1Id = new Types.ObjectId('65ef8c8a1b2c3d4e5f6a7b95');
    const batch2Id = new Types.ObjectId('65ef8c8a1b2c3d4e5f6a7b96');
    const batch3Id = new Types.ObjectId('65ef8c8a1b2c3d4e5f6a7b97');

    // Clear and clean related course, batch and structural models
    await categoriesCol.deleteMany({
      $or: [
        { _id: { $in: [catDevId, catDesignId] } },
        { category_name: { $in: ['Development', 'UI/UX Design'] } },
      ],
    });
    await coursesCol.deleteMany({
      _id: { $in: [course1Id, course2Id, course3Id] },
    });
    await batchesCol.deleteMany({
      _id: { $in: [batch1Id, batch2Id, batch3Id] },
    });
    await enrollmentsCol.deleteMany({ student_id: studentId });
    await lessonsCol.deleteMany({
      course_id: { $in: [course1Id, course2Id, course3Id] },
    });
    await sublessonsCol.deleteMany({
      course_id: { $in: [course1Id, course2Id, course3Id] },
    });
    await assignmentsCol.deleteMany({
      courseId: { $in: [course1Id, course2Id, course3Id] },
    });
    await quizzesCol.deleteMany({
      courseId: { $in: [course1Id, course2Id, course3Id] },
    });
    await liveClassesCol.deleteMany({
      course_id: { $in: [course1Id, course2Id, course3Id] },
    });
    await schedulesCol.deleteMany({
      course_id: { $in: [course1Id, course2Id, course3Id] },
    });
    await cartsCol.deleteMany({ student_id: studentId });
    await chatGroupsCol.deleteMany({
      _id: { $in: [batch1Id, batch2Id, batch3Id] },
    });

    // ─── 2. Seed Category & Organization ───────────────────────────────────
    await categoriesCol.insertMany([
      {
        _id: catDevId,
        category_name: 'Development',
        category_image:
          'https://res.cloudinary.com/demo/image/upload/sample.jpg',
        createdAt: new Date(),
      },
      {
        _id: catDesignId,
        category_name: 'UI/UX Design',
        category_image:
          'https://res.cloudinary.com/demo/image/upload/sample.jpg',
        createdAt: new Date(),
      },
    ]);

    await orgsCol.insertOne({
      _id: orgId,
      name: 'Sandbox Premium Academy',
      email: 'info@sandboxacademy.com',
      logo: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      createdAt: new Date(),
    });

    // ─── 3. Seed Users ─────────────────────────────────────────────────────
    const hashed = await bcrypt.hash('Password123!', 10);

    // Seed Instructor
    await usersCol.insertOne({
      _id: instructorId,
      email: instructorEmail,
      password: hashed,
      firstName: 'Gursewak',
      lastName: 'Dhillon',
      role: 'instructor',
      onboardingStatus: 'complete',
      organisationId: orgId,
      teacherId: teacherProfileId,
      isSubscribed: true,
      provider: 'local',
      createdAt: new Date(),
    });

    await teachersCol.insertOne({
      _id: teacherProfileId,
      email: instructorEmail,
      firstName: 'Gursewak',
      lastName: 'Dhillon',
      role_name: 'Instructor',
      photo:
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=256&auto=format&fit=crop',
      organisation_id: orgId,
      createdAt: new Date(),
    });

    // Seed Student (Active, subscribed, onboarding completed)
    await usersCol.insertOne({
      _id: studentId,
      email: studentEmail,
      password: hashed,
      firstName: 'Alex',
      lastName: 'Sandbox',
      role: 'student',
      onboardingStatus: 'complete',
      isSubscribed: true,
      provider: 'local',
      career: 'Software Engineering',
      topics: ['Development', 'UI/UX Design'],
      educationLevel: 'Bachelor Degree',
      createdAt: new Date(),
    });

    // ─── 4. Seed Courses ───────────────────────────────────────────────────
    await coursesCol.insertMany([
      {
        _id: course1Id,
        course_name: 'Mastering Full-Stack Web Development',
        head_teacher: teacherProfileId,
        duration: '3_months',
        course_type: 'paid',
        course_price: 149,
        demo_class: true,
        category_id: catDevId,
        course_schedule: 'evening',
        live_classes: true,
        batch: [
          {
            batchName: 'Web Dev - Spring 2026 Batch',
            teacher: 'Gursewak Dhillon',
          },
        ],
        course_image_url:
          'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?q=80&w=640&auto=format&fit=crop',
        learning_points: [
          'Build robust REST & GraphQL APIs',
          'Master NestJS & React next frameworks',
          'Deploy scalable cloud apps',
        ],
        skills_you_gain: [
          'TypeScript',
          'Mongoose/MongoDB',
          'React & TailwindCSS',
        ],
        about_course:
          'Comprehensive zero-to-hero curriculum covering frontend, database management, NestJS design patterns, and real-time app architecture.',
        instructor_id: teacherProfileId,
        description:
          'Learn real-world web development alongside a senior Google engineer.',
        overview:
          'Welcome to the academy! Push your limits and develop premium, beautiful, real-world apps.',
        course_status: 'published',
        enrolled_user_count: 1,
        average_rating: 4.8,
        review_count: 12,
        organisation_id: orgId,
        created_by: instructorId,
        createdAt: new Date(),
      },
      {
        _id: course2Id,
        course_name: 'Advanced UI/UX Masterclass',
        head_teacher: teacherProfileId,
        duration: '1_month',
        course_type: 'paid',
        course_price: 99,
        demo_class: false,
        category_id: catDesignId,
        course_schedule: 'morning',
        live_classes: false,
        batch: [
          {
            batchName: 'UI/UX Design - Evening Batch',
            teacher: 'Gursewak Dhillon',
          },
        ],
        course_image_url:
          'https://images.unsplash.com/photo-1561070791-26c113006238?q=80&w=640&auto=format&fit=crop',
        learning_points: [
          'Master dynamic prototyping in Figma',
          'Implement advanced design grids & layouts',
          'Conduct rich user testing sessions',
        ],
        skills_you_gain: ['Figma Pro', 'Prototyping', 'Design Systems'],
        about_course:
          'Learn step-by-step methodologies to craft premium visual UI aesthetics, build fluid animations, and craft seamless user interfaces.',
        instructor_id: teacherProfileId,
        description:
          'Craft beautiful, highly interactive web portals that captivate users.',
        overview:
          'Harness the power of HSL colors, dark modes, animations, and high-fidelity wireframes.',
        course_status: 'published',
        enrolled_user_count: 1,
        average_rating: 4.9,
        review_count: 8,
        organisation_id: orgId,
        created_by: instructorId,
        createdAt: new Date(),
      },
      {
        _id: course3Id,
        course_name: 'Digital Marketing & SEO',
        head_teacher: teacherProfileId,
        duration: '2_weeks',
        course_type: 'free',
        course_price: 0,
        demo_class: false,
        category_id: catDevId,
        course_schedule: 'evening',
        live_classes: false,
        batch: [
          { batchName: 'Marketing Pro Batch', teacher: 'Gursewak Dhillon' },
        ],
        course_image_url:
          'https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=640&auto=format&fit=crop',
        learning_points: [
          'Rank #1 on Google using SEO secrets',
          'Create premium high-converting ad copy',
          'Track marketing analytics dynamically',
        ],
        skills_you_gain: [
          'Google Analytics',
          'SEO optimization',
          'Copywriting',
        ],
        about_course:
          'Acquire direct, actionable digital advertising strategies to rank websites higher and monetize blogs instantly.',
        instructor_id: teacherProfileId,
        description:
          'Dominate organic search pipelines and digital marketing dashboards.',
        overview:
          'Scale brands, drive conversion pipelines, and audit site SEO structures.',
        course_status: 'published',
        enrolled_user_count: 0,
        average_rating: 0,
        review_count: 0,
        organisation_id: orgId,
        created_by: instructorId,
        createdAt: new Date(),
      },
    ]);

    // ─── 5. Seed Batches & Enrollments ─────────────────────────────────────
    await batchesCol.insertMany([
      {
        _id: batch1Id,
        name: 'Web Dev - Spring 2026 Batch',
        course_id: course1Id,
        teacher_id: teacherProfileId,
        organisation_id: orgId,
        chat_group_id: batch1Id,
        createdAt: new Date(),
      },
      {
        _id: batch2Id,
        name: 'UI/UX Design - Evening Batch',
        course_id: course2Id,
        teacher_id: teacherProfileId,
        organisation_id: orgId,
        chat_group_id: batch2Id,
        createdAt: new Date(),
      },
      {
        _id: batch3Id,
        name: 'Marketing Pro Batch',
        course_id: course3Id,
        teacher_id: teacherProfileId,
        organisation_id: orgId,
        chat_group_id: batch3Id,
        createdAt: new Date(),
      },
    ]);

    // Enroll Student in Course 1 and Course 2
    await enrollmentsCol.insertMany([
      {
        student_id: studentId,
        batch_id: batch1Id,
        course_id: course1Id,
        createdAt: new Date(),
      },
      {
        student_id: studentId,
        batch_id: batch2Id,
        course_id: course2Id,
        createdAt: new Date(),
      },
    ]);

    // Add Course 3 directly to Student's Cart to test checkout!
    await cartsCol.insertOne({
      student_id: studentId,
      course_id: course3Id,
      createdAt: new Date(),
    });

    // ─── 6. Seed Lessons & Sublessons ──────────────────────────────────────
    const lesson1Id = new Types.ObjectId('65ef8c8a1b2c3d4e5f6a7ba1');
    const lesson2Id = new Types.ObjectId('65ef8c8a1b2c3d4e5f6a7ba2');
    await lessonsCol.insertMany([
      {
        _id: lesson1Id,
        lesson_name: 'Introduction to Full-Stack Architectures',
        lesson_description:
          'Welcome to full-stack scaling frameworks. Learn structural patterns.',
        course_id: course1Id,
        lesson_image_url:
          'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?q=80&w=256',
        createdAt: new Date(),
      },
      {
        _id: lesson2Id,
        lesson_name: 'Advanced Schema Modeling with Mongoose',
        lesson_description:
          'Deep dive into schemas, embedded arrays, virtuals, and populate queries.',
        course_id: course1Id,
        lesson_image_url:
          'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?q=80&w=256',
        createdAt: new Date(),
      },
    ]);

    await sublessonsCol.insertMany([
      {
        Sublesson_name: 'Lecture 1.1: Web Servers and TCP/IP',
        description: 'Understand node http modules and raw TCP packets.',
        course_id: course1Id,
        lesson_id: lesson1Id,
        photo: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
        createdAt: new Date(),
      },
      {
        Sublesson_name: 'Lecture 1.2: Structuring NestJS DTO Controllers',
        description:
          'Master DTO decorators, validation pipes, and module organization.',
        course_id: course1Id,
        lesson_id: lesson1Id,
        photo: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
        createdAt: new Date(),
      },
      {
        Sublesson_name: 'Lecture 2.1: BSON hex representations and Indexing',
        description:
          'Master compounds indexing strategies for optimal mongo queries.',
        course_id: course1Id,
        lesson_id: lesson2Id,
        photo: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
        createdAt: new Date(),
      },
    ]);

    // ─── 7. Seed Assignments & Quizzes ─────────────────────────────────────
    const assign1Id = new Types.ObjectId('65ef8c8a1b2c3d4e5f6a7bb1');
    await assignmentsCol.insertOne({
      _id: assign1Id,
      assignmentName: 'Building a dynamic LMS Course Player UI',
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
      overview:
        'Develop a responsive course player using React context hooks, responsive grid items, and TailwindCSS glassmorphic styles.',
      courseId: course1Id,
      batchId: String(batch1Id),
      organisationId: orgId,
      created_by: instructorId,
      projects: [
        {
          projectName: 'Part 1: Dynamic Accordions and Header Navigation',
          description:
            'Establish the layout, cards spacing, and accordion selectors.',
          objectives: [
            'Implement clean flex cards gaps',
            'Apply text hover scaling transitions',
          ],
          enableButton: true,
        },
      ],
      status: 'published',
      createdAt: new Date(),
    });

    const quiz1Id = new Types.ObjectId('65ef8c8a1b2c3d4e5f6a7bc1');
    await quizzesCol.insertOne({
      _id: quiz1Id,
      quizName: 'Full-Stack Architecture MCQ Assessment',
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      quizType: 'mcq',
      overview:
        'Quick test of backend systems, validation decorators, and indexing logic.',
      enableTimer: true,
      timer: '00:30',
      courseId: course1Id,
      batchId: String(batch1Id),
      organisationId: orgId,
      created_by: instructorId,
      questions: [
        {
          questionType: 'mcq',
          question: 'Which Mongoose method validates BSON ObjectId sizes?',
          marks: 5,
          options: [
            'Types.ObjectId.isValid()',
            'db.validate()',
            'Object.keys()',
            'typeof string',
          ],
          correctOption: 'Types.ObjectId.isValid()',
          correctAnswer: '',
        },
        {
          questionType: 'mcq',
          question:
            'What is the correct casing expected by NestJS CreateSublessonDto?',
          marks: 5,
          options: [
            'sublesson_name',
            'Sublesson_name',
            'subName',
            'Lesson_name',
          ],
          correctOption: 'Sublesson_name',
          correctAnswer: '',
        },
      ],
      status: 'published',
      createdAt: new Date(),
    });

    // ─── 8. Seed Schedules & Live Classes ──────────────────────────────────
    await liveClassesCol.insertOne({
      course_id: course1Id,
      batch_id: batch1Id,
      title: 'Full-Stack Integration Review',
      start_time: new Date(Date.now() + 15 * 60 * 1000), // In 15 minutes
      end_time: new Date(Date.now() + 75 * 60 * 1000),
      live_class_url: 'https://zoom.us/j/sandboxreview',
      createdAt: new Date(),
    });

    await schedulesCol.insertOne({
      course_id: course1Id,
      batch_id: batch1Id,
      title: 'Lecture Q&A Session - Gursewak Dhillon',
      event_date: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      start_time: '18:00',
      end_time: '19:00',
      createdAt: new Date(),
    });

    // ─── 9. Seed Chat Rooms & Messages ─────────────────────────────────────
    await chatGroupsCol.insertMany([
      {
        _id: batch1Id,
        room_name: 'Web Dev - Spring 2026 Batch',
        course_id: course1Id,
        members: [studentId, instructorId],
        createdAt: new Date(),
      },
      {
        _id: batch2Id,
        room_name: 'UI/UX Design - Evening Batch',
        course_id: course2Id,
        members: [studentId, instructorId],
        createdAt: new Date(),
      },
    ]);

    await chatMessagesCol.insertMany([
      {
        group_id: batch1Id,
        sender_id: instructorId,
        sender_name: 'Gursewak Dhillon',
        message:
          'Welcome everyone! Today we will seed the database and complete student workflows.',
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
      },
      {
        group_id: batch1Id,
        sender_id: studentId,
        sender_name: 'Alex Sandbox',
        message:
          'Awesome, Gursewak! Looking forward to reviewing the assignment details and real-time chat sync.',
        createdAt: new Date(Date.now() - 30 * 60 * 1000),
      },
    ]);

    return {
      status: true,
      message: 'Student Sandbox Database seeded successfully!',
      data: {
        student: {
          email: studentEmail,
          password: 'Password123!',
          first_name: 'Alex',
          last_name: 'Sandbox',
        },
      },
    };
  }
}
