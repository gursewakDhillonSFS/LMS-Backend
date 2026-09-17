import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommunicationController } from './communication.controller';
import { CommunicationService } from './communication.service';
import { CommunicationGateway } from './communication.gateway';
import { ChatGroup, ChatGroupSchema } from './schemas/chat-group.schema';
import { ChatMessage, ChatMessageSchema } from './schemas/chat-message.schema';
import { User, UserSchema } from '../user/schemas/user.schema';
import { Course, CourseSchema } from '../course/schemas/course.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChatGroup.name, schema: ChatGroupSchema },
      { name: ChatMessage.name, schema: ChatMessageSchema },
      { name: User.name, schema: UserSchema },
      { name: Course.name, schema: CourseSchema },
    ]),
    AuthModule,
  ],
  controllers: [CommunicationController],
  providers: [CommunicationService, CommunicationGateway],
  exports: [CommunicationService],
})
export class CommunicationModule {}
