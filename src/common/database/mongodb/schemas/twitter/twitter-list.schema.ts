import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TwitterListDocument = TwitterList & Document;

@Schema({ timestamps: true })
export class TwitterList {
  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: false })
  importedFromX: boolean;

  @Prop({ type: String, default: null })
  xListId: string | null;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'XUser' }], default: [] })
  members: Types.ObjectId[];
}

export const TwitterListSchema = SchemaFactory.createForClass(TwitterList);
