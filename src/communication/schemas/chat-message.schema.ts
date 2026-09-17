import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChatMessageDocument = ChatMessage & Document;

@Schema({ timestamps: true, collection: 'chat_messages' })
export class ChatMessage {
  @Prop({ type: Types.ObjectId, ref: 'ChatGroup', required: true })
  groupId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  senderId: Types.ObjectId;

  @Prop({ type: String, required: true })
  message: string;

  @Prop({ type: String, default: 'text' })
  messageType: string;

  @Prop({
    type: [
      {
        emoji: { type: String, required: true },
        count: { type: Number, default: 0 },
        users: [{ type: String }],
      },
    ],
    default: [],
  })
  reactions: {
    emoji: string;
    count: number;
    users: string[];
  }[];
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);
ChatMessageSchema.index({ groupId: 1, createdAt: -1 });
