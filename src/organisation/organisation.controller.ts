import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OrganisationService } from './organisation.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateOrganisationDto } from './dto/create-organisation.dto';

@Controller('auth/user/v1/organization')
@UseGuards(JwtAuthGuard)
export class OrganisationController {
  constructor(private readonly orgService: OrganisationService) {}

  // POST /auth/user/v1/organization/create
  // Frontend sends multipart/form-data with:
  //   - photo: (file)
  //   - payload: JSON string with { name, email, number_of_teachers, organization_type, user_id }
  @Post('create')
  @UseInterceptors(FileInterceptor('photo')) // ← frontend sends field name "photo"
  create(
    @Body('payload') payloadStr: string, // ← raw JSON string from form-data field "payload"
    @Request() req,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let dto: CreateOrganisationDto;
    try {
      dto = payloadStr ? JSON.parse(payloadStr) : {};
    } catch {
      throw new BadRequestException('Invalid payload JSON');
    }

    const userId = req.user.userId;
    return this.orgService.create(dto, userId, file);
  }

  // GET /auth/user/v1/organization/:id
  @Get(':id')
  findById(@Param('id') id: string) {
    return this.orgService.findById(id);
  }
}
