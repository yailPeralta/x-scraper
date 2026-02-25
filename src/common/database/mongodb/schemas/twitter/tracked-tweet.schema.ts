import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type TrackedTweetDocument = TrackedTweet & Document;

@Schema({ _id: false })
export class TrackedTweetMetrics {
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
}

@Schema({ _id: false })
export class TrackedTweetMedia {
  @Prop({ required: true, enum: ['image', 'video', 'gif'] })
  type: string;

  @Prop({ required: true })
  url: string;

  @Prop()
  previewImageUrl: string;

  @Prop()
  altText: string;
}

@Schema({ timestamps: true })
export class TrackedTweet {
  @Prop({ required: true, unique: true, index: true })
  tweetId: string;

  @Prop({ required: true, index: true })
  authorId: string;

  @Prop({ index: true })
  authorUsername: string;

  @Prop({ required: true })
  text: string;

  @Prop({ index: true })
  tweetCreatedAt: Date;

  @Prop({ type: TrackedTweetMetrics })
  metrics: TrackedTweetMetrics;

  @Prop({ type: [TrackedTweetMedia] })
  media: TrackedTweetMedia[];

  @Prop({ type: [String], index: true })
  hashtags: string[];

  @Prop({ type: [String], index: true })
  cashtags: string[];

  @Prop({ type: [String] })
  mentions: string[];

  @Prop({ type: [String] })
  urls: string[];

  @Prop({
    enum: ['original', 'retweet', 'reply', 'quote'],
    index: true,
  })
  tweetType: string;

  @Prop({ type: [String], default: [] })
  matchedTrackerIds: string[];

  @Prop({ type: [String], default: [] })
  matchedRuleTags: string[];

  @Prop({ type: MongooseSchema.Types.Mixed })
  rawData: Record<string, any>;
}

export const TrackedTweetSchema = SchemaFactory.createForClass(TrackedTweet);

TrackedTweetSchema.index({ authorId: 1, tweetCreatedAt: -1 });
TrackedTweetSchema.index({ hashtags: 1, tweetCreatedAt: -1 });
TrackedTweetSchema.index({ cashtags: 1, tweetCreatedAt: -1 });
TrackedTweetSchema.index({ matchedTrackerIds: 1, tweetCreatedAt: -1 });
TrackedTweetSchema.index({ matchedRuleTags: 1, tweetCreatedAt: -1 });
