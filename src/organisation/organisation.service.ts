import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Organisation,
  OrganisationDocument,
} from './schemas/organisation.schema';
import { User, UserDocument } from '../user/schemas/user.schema';
import { CreateOrganisationDto } from './dto/create-organisation.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Injectable()
export class OrganisationService {
  constructor(
    @InjectModel(Organisation.name)
    private orgModel: Model<OrganisationDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private cloudinary: CloudinaryService,
  ) {}

  async create(
    dto: CreateOrganisationDto,
    userId: string,
    file?: Express.Multer.File,
  ) {
    // ── Upsert logic ─────────────────────────────────────────────────────────
    // If the user already has an organisation, UPDATE it.
    // If an org with the same email exists, UPDATE it.
    // Otherwise, CREATE a new one.
    const user = await this.userModel.findById(userId);
    const existingOrgId = user?.organisationId;

    let photo_url: string | null = null;

    // Only upload new photo if a file was provided
    if (file && file.size > 0) {
      const uploaded = await this.cloudinary.uploadFile(
        file,
        'lms/organisations',
      );
      photo_url = uploaded.secure_url;
    }

    const updatePayload: Record<string, unknown> = {
      name: dto.name,
      email: dto.email?.toLowerCase(),
      number_of_teachers: Number(dto.number_of_teachers) || 0,
      organization_type: dto.organization_type,
    };
    if (photo_url) updatePayload.photo_url = photo_url; // only overwrite if new photo uploaded
    if (userId) {
      try {
        updatePayload.creatorUserId = new Types.ObjectId(userId);
      } catch {
        // invalid objectid string
      }
    }

    let org: OrganisationDocument;
    let isNew = false;

    if (existingOrgId) {
      // User already has an org — update it (back button case)
      org = (await this.orgModel.findByIdAndUpdate(
        existingOrgId,
        { $set: updatePayload },
        { new: true },
      )) as OrganisationDocument;

      if (!org) {
        // Org was deleted externally — fall through to create
        org = (await this.orgModel.create({
          ...updatePayload,
          photo_url: photo_url ?? null,
        })) as OrganisationDocument;
        isNew = true;
      }
    } else {
      // No existing org — check by email first (idempotent)
      const byEmail = await this.orgModel.findOne({
        email: dto.email?.toLowerCase(),
      });

      if (byEmail) {
        org = (await this.orgModel.findByIdAndUpdate(
          byEmail._id,
          { $set: updatePayload },
          { new: true },
        )) as OrganisationDocument;
        isNew = false;
      } else {
        org = (await this.orgModel.create({
          ...updatePayload,
          photo_url: photo_url ?? null,
        })) as OrganisationDocument;
        isNew = true;
      }
    }

    // Always guarantee user has organisationId linked
    if (userId && org?._id) {
      await this.userModel.findByIdAndUpdate(userId, {
        organisationId: org._id,
      });
    }

    return {
      status: true,
      message: isNew
        ? 'Organisation created successfully'
        : 'Organisation updated successfully',
      data: this.formatOrg(org),
    };
  }

  async findById(id: string) {
    const org = await this.orgModel.findById(id);
    if (!org) throw new NotFoundException('Organisation not found');
    return { status: true, data: this.formatOrg(org) };
  }

  private formatOrg(org: OrganisationDocument) {
    return {
      organization_id: String(org._id),
      name: org.name,
      email: org.email,
      number_of_teachers: org.number_of_teachers,
      organization_type: org.organization_type,
      photo_url: org.photo_url,
    };
  }
}
