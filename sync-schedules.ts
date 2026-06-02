import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { Model } from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';
import { Assignment } from './src/assignment/schemas/assignment.schema';
import { Quiz } from './src/quiz/schemas/quiz.schema';
import { Schedule } from './src/schedule/schemas/schedule.schema';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const assignmentModel = app.get<Model<any>>(getModelToken(Assignment.name));
  const quizModel = app.get<Model<any>>(getModelToken(Quiz.name));
  const scheduleModel = app.get<Model<any>>(getModelToken(Schedule.name));

  // Sync assignments
  const assignments = await assignmentModel.find({ status: 'published' });
  for (const a of assignments) {
    const existing = await scheduleModel.findOne({ title: `Assignment: ${a.assignmentName}`, courseId: a.courseId });
    if (!existing) {
      await scheduleModel.create({
        title: `Assignment: ${a.assignmentName}`,
        description: `Due date for assignment: ${a.assignmentName}`,
        date: a.dueDate,
        startTime: '00:00',
        endTime: '23:59',
        courseId: a.courseId,
        batchId: a.batchId,
        createdBy: a.created_by,
        organisationId: a.organisationId,
        meetingLink: '',
      });
      console.log('Created schedule for assignment:', a.assignmentName);
    }
  }

  // Sync quizzes
  const quizzes = await quizModel.find({ status: 'published' });
  for (const q of quizzes) {
    const existing = await scheduleModel.findOne({ title: `Quiz: ${q.quizName}`, courseId: q.courseId });
    if (!existing) {
      await scheduleModel.create({
        title: `Quiz: ${q.quizName}`,
        description: `Due date for quiz: ${q.quizName}`,
        date: q.dueDate,
        startTime: '00:00',
        endTime: '23:59',
        courseId: q.courseId,
        batchId: q.batchId,
        createdBy: q.created_by,
        organisationId: q.organisationId,
        meetingLink: '',
      });
      console.log('Created schedule for quiz:', q.quizName);
    }
  }

  await app.close();
}

bootstrap();
