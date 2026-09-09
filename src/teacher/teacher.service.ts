import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as ejs from 'ejs';
import { Teacher, TeacherDocument } from './schemas/teacher.schema';
import {
  User,
  UserDocument,
  UserRole,
  OnboardingStatus,
} from '../user/schemas/user.schema';
import {
  Organisation,
  OrganisationDocument,
} from '../organisation/schemas/organisation.schema';
import { CreateTeacherDto, UpdateTeacherDto } from './dto/teacher.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Injectable()
export class TeacherService {
  private readonly logger = new Logger(TeacherService.name);

  constructor(
    @InjectModel(Teacher.name) private teacherModel: Model<TeacherDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Organisation.name)
    private orgModel: Model<OrganisationDocument>,
    private cloudinary: CloudinaryService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  // ─── Called during instructor onboarding OR when inviting a teacher ──────────────────
  async create(dto: CreateTeacherDto, file?: Express.Multer.File) {
    // 1. Prevent duplicate teacher profile
    const existingTeacher = await this.teacherModel.findOne({
      email: dto.email.toLowerCase(),
    });
    if (existingTeacher) {
      throw new ConflictException(
        'A teacher profile with this email already exists',
      );
    }

    let photo: string | null = null;
    if (file) {
      const uploaded = await this.cloudinary.uploadFile(file, 'lms/teachers');
      photo = uploaded.secure_url;
    }

    // 2. Determine if self-onboarding (became instructor flow) or explicit invitation
    let creatorUser: UserDocument | null = null;
    let isSelfOnboarding = false;

    if (dto.user_id) {
      creatorUser = await this.userModel.findById(dto.user_id);
      if (
        creatorUser &&
        (creatorUser.email.toLowerCase() === dto.email.toLowerCase() ||
          creatorUser.onboardingStatus === OnboardingStatus.PENDING)
      ) {
        isSelfOnboarding = true;
      }
    }

    // 3. Resolve Organisation ID
    let finalOrganisationId: Types.ObjectId | null = null;
    if (isSelfOnboarding && creatorUser?.organisationId) {
      finalOrganisationId = creatorUser.organisationId;
    } else if (creatorUser?.organisationId) {
      // The creator is an instructor inviting a teacher into their organization
      finalOrganisationId = creatorUser.organisationId;
    }

    // 4. Create the Teacher record
    const teacher = (await this.teacherModel.create({
      firstName: dto.First_name,
      lastName: dto.Last_name,
      gender: dto.gender,
      dob: dto.dob,
      maritalStatus: dto.marital_status,
      email: dto.email.toLowerCase(),
      phone: dto.phone_number,
      qualification: dto.qualification,
      expertIn: dto.expert_in || [],
      photo,
      organisationId: finalOrganisationId || undefined,
    })) as TeacherDocument;

    // 5. Manage the related User account
    let targetUserId: string | null = null;
    let setupLink: string | null = null;

    if (isSelfOnboarding && creatorUser) {
      // Link existing user during onboarding
      creatorUser.teacherId = teacher._id;
      creatorUser.onboardingStatus = OnboardingStatus.COMPLETE;
      await creatorUser.save();
      targetUserId = String(creatorUser._id);
    } else {
      // Invitation Flow: Create a brand new User entry for this teacher
      const userExists = await this.userModel.findOne({
        email: dto.email.toLowerCase(),
      });
      if (userExists) {
        throw new ConflictException(
          'A user account with this email already exists',
        );
      }

      const newUser = (await this.userModel.create({
        email: dto.email.toLowerCase(),
        firstName: dto.First_name,
        lastName: dto.Last_name,
        role: UserRole.TEACHER,
        onboardingStatus: OnboardingStatus.COMPLETE, // teachers skip onboarding
        organisationId: finalOrganisationId || undefined,
        teacherId: teacher._id,
      })) as UserDocument;
      targetUserId = String(newUser._id);

      // Generate password setup JWT token (valid for 48 hours)
      const setupToken = this.jwtService.sign(
        { sub: newUser._id, purpose: 'reset' },
        { expiresIn: '48h' },
      );

      const frontendUrl =
        this.configService.get('FRONTEND_URL') || 'http://localhost:3000';
      setupLink = `${frontendUrl}/setup-password?token=${setupToken}&userId=${newUser._id}`;

      this.logger.log(
        `\n=======================================================\n🔑 TEACHER INVITATION ACTIVATION LINK:\n${setupLink}\n=======================================================\n`,
      );

      // 6. Deliver invitation email via Brevo or Nodemailer
      try {
        let orgName = 'LMS Platform';
        if (finalOrganisationId) {
          const org = await this.orgModel.findById(finalOrganisationId);
          if (org) orgName = org.name;
        }

        const templatePath = path.join(
          __dirname,
          'templates',
          'invite-teacher.ejs',
        );
        const resolvedTemplatePath = fs.existsSync(templatePath)
          ? templatePath
          : path.join(
              process.cwd(),
              'src',
              'teacher',
              'templates',
              'invite-teacher.ejs',
            );

        if (fs.existsSync(resolvedTemplatePath)) {
          const templateStr = fs.readFileSync(resolvedTemplatePath, 'utf8');
          const renderedHtml = ejs.render(templateStr, {
            name: `${dto.First_name} ${dto.Last_name}`,
            organisationName: orgName,
            setupLink,
          });

          const apiKey = this.configService.get('BREVO_API_KEY');
          const senderEmail = this.configService.get('BREVO_SENDER_EMAIL');
          const senderName = this.configService.get('BREVO_SENDER_NAME');

          let emailDelivered = false;

          if (apiKey) {
            try {
              const response = await fetch(
                'https://api.brevo.com/v3/smtp/email',
                {
                  method: 'POST',
                  headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'api-key': apiKey,
                  },
                  body: JSON.stringify({
                    sender: {
                      name: senderName || 'LMS Platform',
                      email: senderEmail || 'info@lms.com',
                    },
                    to: [
                      {
                        email: teacher.email,
                        name: `${teacher.firstName} ${teacher.lastName}`,
                      },
                    ],
                    subject: `Welcome to Learning+ - Action Required to Set Up Your Account`,
                    htmlContent: renderedHtml,
                  }),
                },
              );

              if (response.ok) {
                this.logger.log(
                  `Invitation email successfully dispatched to ${teacher.email} via Brevo`,
                );
                emailDelivered = true;
              } else {
                const errorBody = await response.text();
                this.logger.warn(
                  `Brevo email dispatch failed (status ${response.status}): ${errorBody}`,
                );
              }
            } catch (brevoErr) {
              this.logger.warn(`Brevo network dispatch error: ${brevoErr.message}`);
            }
          }

          // Fallback to Nodemailer if Brevo didn't succeed and SMTP is configured
          if (!emailDelivered) {
            const emailUser = this.configService.get('EMAIL_USER');
            const emailPass = this.configService.get('EMAIL_PASS');
            if (emailUser && emailPass && !emailUser.includes('your-email')) {
              try {
                const nodemailer = await import('nodemailer');
                const transporter = nodemailer.createTransport({
                  service: 'gmail',
                  auth: { user: emailUser, pass: emailPass },
                });
                await transporter.sendMail({
                  from: `"${senderName || 'LMS Platform'}" <${emailUser}>`,
                  to: teacher.email,
                  subject: `Welcome to Learning+ - Action Required to Set Up Your Account`,
                  html: renderedHtml,
                });
                this.logger.log(
                  `Invitation email successfully dispatched to ${teacher.email} via Nodemailer`,
                );
                emailDelivered = true;
              } catch (nmErr) {
                this.logger.warn(`Nodemailer fallback failed: ${nmErr.message}`);
              }
            }
          }
        }
      } catch (mailError) {
        this.logger.error(
          'An unhandled exception occurred while attempting email dispatch',
          mailError.stack,
        );
      }
    }

    return {
      success: true,
      status: true,
      message: isSelfOnboarding
        ? 'Teacher profile created successfully'
        : 'Teacher invited successfully. Activation link generated.',
      teacher: this.formatTeacherForFrontend(teacher),
      setupLink: setupLink || undefined,
    };
  }

  // Helper to transform backend DB model to expected frontend InstructorRecord
  private formatTeacherForFrontend(teacher: TeacherDocument) {
    return {
      instructor_id: String(teacher._id),
      key: String(teacher._id),
      name: `${teacher.firstName} ${teacher.lastName}`,
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      gender: teacher.gender || 'N/A',
      dob: teacher.dob || 'N/A',
      marital_status: teacher.maritalStatus || 'Single',
      email: teacher.email,
      phone_number: teacher.phone || 'N/A',
      qualification: teacher.qualification || 'N/A',
      expert_in: teacher.expertIn || [],
      image_url: teacher.photo || null,
      no_of_courses: 0,
      status: 'active',
    };
  }

  // ─── Get all teachers (paginated) ───────────────────────────────────────────
  async findAll(
    page = 1,
    limit = 10,
    organisationId?: string,
    search?: string,
    userId?: string,
  ) {
    const skip = (page - 1) * limit;
    let targetOrgId = organisationId;

    if (userId) {
      const callingUser = await this.userModel.findById(userId).lean();
      if (callingUser && callingUser.role !== 'admin' && callingUser.organisationId) {
        targetOrgId = String(callingUser.organisationId);
      }
    }

    const filter: Record<string, unknown> = targetOrgId
      ? { organisationId: new Types.ObjectId(String(targetOrgId)) }
      : {};

    if (search) {
      const regex = new RegExp(search, 'i');
      filter.$or = [
        { firstName: regex },
        { lastName: regex },
        { email: regex },
      ];
    }

    const [teachers, total] = await Promise.all([
      this.teacherModel
        .find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      this.teacherModel.countDocuments(filter),
    ]);

    return {
      status: true,
      data: {
        instructors: teachers.map((t) => this.formatTeacherForFrontend(t)),
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── Get single teacher by ID ────────────────────────────────────────────────
  async findById(id: string) {
    const teacher = await this.teacherModel.findById(id);
    if (!teacher) throw new NotFoundException('Teacher not found');
    return {
      status: true,
      data: this.formatTeacherForFrontend(teacher),
    };
  }

  // ─── Update teacher ──────────────────────────────────────────────────────────
  async update(id: string, dto: UpdateTeacherDto, file?: Express.Multer.File) {
    const teacher = await this.teacherModel.findById(id);
    if (!teacher) throw new NotFoundException('Teacher not found');

    let photo = teacher.photo;
    if (file) {
      const uploaded = await this.cloudinary.uploadFile(file, 'lms/teachers');
      photo = uploaded.secure_url;
    }

    const updated = await this.teacherModel.findByIdAndUpdate(
      id,
      {
        ...(dto.First_name && { firstName: dto.First_name }),
        ...(dto.Last_name && { lastName: dto.Last_name }),
        ...(dto.gender && { gender: dto.gender }),
        ...(dto.dob && { dob: dto.dob }),
        ...(dto.marital_status && { maritalStatus: dto.marital_status }),
        ...(dto.email && { email: dto.email.toLowerCase() }),
        ...(dto.phone_number && { phone: dto.phone_number }),
        ...(dto.qualification && { qualification: dto.qualification }),
        ...(dto.expert_in && { expertIn: dto.expert_in }),
        photo,
      },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('Teacher not found');
    }

    return {
      status: true,
      message: 'Teacher updated successfully',
      data: this.formatTeacherForFrontend(updated),
    };
  }

  // ─── Delete teacher ──────────────────────────────────────────────────────────
  async delete(id: string) {
    const teacher = await this.teacherModel.findByIdAndDelete(id);
    if (!teacher) throw new NotFoundException('Teacher not found');
    return {
      status: true,
      message: 'Teacher deleted successfully',
    };
  }

  // ─── Dropdown list for course creation ──────────────────────────────────────
  async dropdown(userId?: string) {
    let filter = {};
    
    if (userId) {
      const user = await this.userModel.findById(userId);
      if (user && user.organisationId) {
        filter = { organisationId: user.organisationId };
      }
    }

    const teachers = await this.teacherModel
      .find(filter)
      .select('_id firstName lastName email photo')
      .sort({ firstName: 1 });
      
    return { success: true, status: true, teachers };
  }
}
