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
import { QuizService } from './quiz.service';
import {
  CreateQuizDto,
  UpdateQuizDto,
  GradeQuizSubmissionDto,
} from './dto/quiz.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/interfaces/auth-request.interface';

@UseGuards(JwtAuthGuard)
@Controller('auth/quiz/v1')
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  // POST /auth/quiz/v1/create
  @Post('create')
  create(@Body() dto: CreateQuizDto, @Req() req: AuthenticatedRequest) {
    const userId = req.user.userId;
    return this.quizService.create(dto, userId);
  }

  // GET /auth/quiz/v1/by-batch?batchId=&tab=ongoing&page=1&limit=10&courseId=
  @Get('by-batch')
  findByBatch(
    @Query('batchId') batchId: string,
    @Query('tab') tab: 'ongoing' | 'past' = 'ongoing',
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('courseId') courseId?: string,
    @Req() req?: AuthenticatedRequest,
  ) {
    const studentId = req?.user?.userId;
    return this.quizService.findByBatch(
      batchId,
      tab,
      Number(page),
      Number(limit),
      studentId,
      courseId,
    );
  }

  // GET /auth/quiz/v1/details/:id
  @Get('details/:id')
  findById(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.quizService.findById(id, req.user?.role);
  }

  // GET /auth/quiz/v1/by-course/:courseId
  @Get('by-course/:courseId')
  findByCourse(@Param('courseId') courseId: string) {
    return this.quizService.findByCourse(courseId);
  }

  // PUT /auth/quiz/v1/update/:id
  @Put('update/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateQuizDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.userId;
    const role = req.user.role;
    return this.quizService.update(id, dto, userId, role);
  }

  // DELETE /auth/quiz/v1/delete/:id
  @Delete('delete/:id')
  delete(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user.userId;
    const role = req.user.role;
    return this.quizService.delete(id, userId, role);
  }

  // GET /auth/quiz/v1/:id/submissions?page=1&limit=10&search=
  @Get(':id/submissions')
  getSubmissions(
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('search') search?: string,
    @Req() req?: AuthenticatedRequest,
  ) {
    const userId = req?.user?.userId;
    const role = req?.user?.role;
    return this.quizService.getSubmissions(
      id,
      Number(page),
      Number(limit),
      search,
      userId,
      role,
    );
  }

  // POST /auth/quiz/v1/submissions/grade
  @Post('submissions/grade')
  gradeSubmission(@Body() dto: GradeQuizSubmissionDto) {
    return this.quizService.gradeSubmission(dto);
  }

  // POST /auth/quiz/v1/:id/submit
  @Post(':id/submit')
  submitQuiz(
    @Param('id') id: string,
    @Body()
    dto: {
      answers: {
        questionIndex: number;
        questionType: 'mcq' | 'essay';
        selectedOption?: string;
        submittedText?: string;
      }[];
    },
    @Req() req: AuthenticatedRequest,
  ) {
    const studentId = req.user.userId;
    return this.quizService.submitQuiz(id, studentId, dto.answers);
  }
}
