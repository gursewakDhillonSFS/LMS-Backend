import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TeacherService } from './teacher.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateTeacherDto, UpdateTeacherDto } from './dto/teacher.dto';

// All teacher routes live under /auth/course/v1 to match frontend collections.ts
@Controller('auth/course/v1')
@UseGuards(JwtAuthGuard)
export class TeacherController {
  constructor(private readonly teacherService: TeacherService) {}

  // POST /auth/course/v1/create-Instructor  ← instructor onboarding step 2
  @Post('create-Instructor')
  @UseInterceptors(FileInterceptor('photo'))
  create(
    @Body() dto: CreateTeacherDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.teacherService.create(dto, file);
  }

  // GET /auth/course/v1/get-all-Instructor
  @Get('get-all-Instructor')
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('organisationId') organisationId?: string,
    @Query('search') search?: string,
  ) {
    return this.teacherService.findAll(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 10,
      organisationId,
      search,
    );
  }

  // GET /auth/course/v1/get-Instructor-by-id?teacher_id=xxx OR ?instrcutor_id=xxx
  @Get('get-Instructor-by-id')
  findById(
    @Query('teacher_id') id?: string,
    @Query('instrcutor_id') idTypo?: string,
  ) {
    const finalId = id || idTypo;
    if (!finalId) throw new BadRequestException('Teacher ID is required');
    return this.teacherService.findById(finalId);
  }

  // GET /auth/course/v1/instructors/dropdown
  @Get('instructors/dropdown')
  dropdown(@Req() req: any) {
    return this.teacherService.dropdown(req.user?.userId);
  }

  // PUT /auth/course/v1/instructor/update
  @Put('instructor/update')
  @UseInterceptors(FileInterceptor('photo'))
  update(
    @Body() body: Record<string, unknown>,
    @Query('teacher_id') id?: string,
    @Query('instrcutor_id') idTypo?: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let parsedDto: unknown = body;
    let finalId = id || idTypo;

    // Handle frontend multipart FormData where all fields are JSON serialized inside 'data'
    if (body && typeof body.data === 'string') {
      try {
        const parsed = JSON.parse(body.data);
        parsedDto = parsed;
        if (parsed.instrcutor_id) {
          finalId = parsed.instrcutor_id;
        }
      } catch (e) {
        // Fallback to raw body if parsing fails
      }
    }

    if (!finalId) throw new BadRequestException('Teacher ID is required');
    return this.teacherService.update(
      finalId,
      parsedDto as UpdateTeacherDto,
      file,
    );
  }

  // DELETE /auth/course/v1/delete-instructor/:id
  @Delete('delete-instructor/:id')
  delete(@Param('id') id: string) {
    return this.teacherService.delete(id);
  }
}
