import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type EngagementSnapshotDocument = EngagementSnapshot & Document;

@Schema({ timestamps: true })
export class EngagementSnapshot {
  @Prop({ required: true, index: true })
  tweetId: string;

  @Prop({ required: true, index: true })
  authorId: string;

  @Prop({ default: 0 })
  likes: number;

  @Prop({ default: 0 })
  retweets: number;

  @Prop({ default: 0 })
  replies: number;

  @Prop({ default: 0 })
  views: number;

  @Prop({ default: 0 })
  bookmarks: number;

  @Prop({ required: true, index: true })
  snapshotAt: Date;
}

export const EngagementSnapshotSchema =
  SchemaFactory.createForClass(EngagementSnapshot);

EngagementSnapshotSchema.index({ tweetId: 1, snapshotAt: -1 });
