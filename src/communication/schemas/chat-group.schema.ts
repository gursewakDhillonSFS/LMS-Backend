import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChatGroupDocument = ChatGroup & Document;

@Schema({ timestamps: true, collection: 'chat_groups' })
export class ChatGroup {
  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  course_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  batch_id: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  members: Types.ObjectId[];
}

export const ChatGroupSchema = SchemaFactory.createForClass(ChatGroup);
ChatGroupSchema.index({ batch_id: 1 }, { unique: true });
