import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ScheduleService } from './schedule.service';
import { CreateScheduleDto, UpdateScheduleDto } from './dto/schedule.dto';

@UseGuards(JwtAuthGuard)
@Controller('auth/schedule/v1')
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Post('create')
  create(@Body() dto: CreateScheduleDto, @Request() req) {
    if (req.user.role !== 'instructor' && req.user.role !== 'teacher') {
      throw new ForbiddenException(
        'Only instructors and teachers are authorized to create schedule events',
      );
    }
    return this.scheduleService.create(req.user.userId, dto);
  }

  @Get('list')
  findAll(
    @Request() req,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('courseId') courseId?: string,
    @Query('batchId') batchId?: string,
  ) {
    const monthNum = month ? parseInt(month, 10) : undefined;
    const yearNum = year ? parseInt(year, 10) : undefined;
    return this.scheduleService.findAll(
      req.user.userId,
      monthNum,
      yearNum,
      courseId,
      batchId,
    );
  }

  @Put('update/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateScheduleDto,
    @Request() req,
  ) {
    if (req.user.role !== 'instructor' && req.user.role !== 'teacher') {
      throw new ForbiddenException(
        'Only instructors and teachers are authorized to update schedule events',
      );
    }
    return this.scheduleService.update(req.user.userId, id, dto);
  }

  @Delete('delete/:id')
  delete(@Param('id') id: string, @Request() req) {
    if (req.user.role !== 'instructor' && req.user.role !== 'teacher') {
      throw new ForbiddenException(
        'Only instructors and teachers are authorized to delete schedule events',
      );
    }
    return this.scheduleService.delete(req.user.userId, id);
  }

  @Put('recording/:id')
  updateRecording(
    @Param('id') id: string,
    @Body() body: { recordingUrl: string; recordingName?: string },
    @Request() req,
  ) {
    if (req.user.role !== 'instructor' && req.user.role !== 'teacher') {
      throw new ForbiddenException(
        'Only instructors and teachers are authorized to update schedule recordings',
      );
    }
    return this.scheduleService.updateRecording(
      req.user.userId,
      id,
      body.recordingUrl,
      body.recordingName,
    );
  }
}
