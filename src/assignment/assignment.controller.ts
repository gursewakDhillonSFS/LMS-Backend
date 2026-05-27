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
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AuthenticatedRequest } from '../common/interfaces/auth-request.interface';
import { AssignmentService } from './assignment.service';
import {
  CreateAssignmentDto,
  UpdateAssignmentDto,
  GradeSubmissionDto,
} from './dto/assignment.dto';

@UseGuards(AuthGuard('jwt'))
@Controller('auth/assignment/v1')
export class AssignmentController {
  constructor(private readonly assignmentService: AssignmentService) {}

  // POST /auth/assignment/v1/create
  @Post('create')
  create(@Body() dto: CreateAssignmentDto, @Req() req: AuthenticatedRequest) {
    const userId = req.user.userId;
    return this.assignmentService.create(dto, userId);
  }

  // GET /auth/assignment/v1/by-batch?batchId=&courseId=&tab=ongoing&page=1&limit=10
  @Get('by-batch')
  findByBatch(
    @Query('batchId') batchId: string,
    @Query('courseId') courseId: string,
    @Query('tab') tab: 'ongoing' | 'past' = 'ongoing',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Req() req?: AuthenticatedRequest,
  ) {
    const studentId = req?.user?.userId;
    return this.assignmentService.findByBatch(
      batchId,
      courseId,
      tab,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 10,
      studentId,
    );
  }

  // GET /auth/assignment/v1/details/:id
  @Get('details/:id')
  findById(@Param('id') id: string) {
    return this.assignmentService.findById(id);
  }

  // GET /auth/assignment/v1/by-course/:courseId
  @Get('by-course/:courseId')
  findByCourse(@Param('courseId') courseId: string) {
    return this.assignmentService.findByCourse(courseId);
  }

  // PUT /auth/assignment/v1/update/:id
  @Put('update/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAssignmentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.userId;
    const role = req.user.role;
    return this.assignmentService.update(id, dto, userId, role);
  }

  // DELETE /auth/assignment/v1/delete/:id
  @Delete('delete/:id')
  delete(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user.userId;
    const role = req.user.role;
    return this.assignmentService.delete(id, userId, role);
  }

  // GET /auth/assignment/v1/:id/submissions?page=1&limit=10&search=
  @Get(':id/submissions')
  getSubmissions(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.assignmentService.getSubmissions(
      id,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 10,
      search,
    );
  }

  // POST /auth/assignment/v1/submissions/grade
  @Post('submissions/grade')
  gradeSubmission(@Body() dto: GradeSubmissionDto) {
    return this.assignmentService.gradeSubmission(dto);
  }

  // POST /auth/assignment/v1/:id/submit
  @Post(':id/submit')
  submitAssignment(
    @Param('id') id: string,
    @Body() dto: { submittedText: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const studentId = req.user.userId;
    return this.assignmentService.submitAssignment(id, studentId, dto.submittedText);
  }
}
