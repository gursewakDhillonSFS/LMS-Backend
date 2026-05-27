import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CategoryDocument = Category & Document;

@Schema({ timestamps: true, collection: 'categories' })
export class Category {
  @Prop({ required: true, unique: true, trim: true })
  category_name: string;

  @Prop({ type: String, default: null })
  description: string | null;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export const CategorySchema = SchemaFactory.createForClass(Category);
