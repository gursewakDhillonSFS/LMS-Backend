import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OrganisationDocument = Organisation & Document;

@Schema({ timestamps: true, collection: 'organisations' })
export class Organisation {
  // Frontend getOrganisation() reads: photo_url
  @Prop({ type: String, default: null })
  photo_url: string | null;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  // Frontend reads: number_of_teachers
  @Prop({ type: Number, default: 0 })
  number_of_teachers: number;

  // Frontend reads: organization_type
  @Prop({ type: String, default: null })
  organization_type: string | null;
}

export const OrganisationSchema = SchemaFactory.createForClass(Organisation);
