import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TrendingTopicDocument = TrendingTopic & Document;

@Schema({ timestamps: true })
export class TrendingTopic {
  @Prop({ required: true, unique: true, index: true })
  tag: string;

  @Prop({ required: true })
  nameEn: string;

  @Prop({ required: true })
  nameEs: string;
}

export const TrendingTopicSchema = SchemaFactory.createForClass(TrendingTopic);
