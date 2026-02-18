import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TweetDocument = Tweet & Document;

@Schema({ _id: false })
export class TweetAuthor {
  @Prop({ required: true })
  username: string;

  @Prop({ required: true })
  displayName: string;

  @Prop({ required: true })
  userId: string;

  @Prop()
  profileImageUrl: string;

  @Prop({ default: false })
  verified: boolean;
}

@Schema({ _id: false })
export class TweetMetrics {
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
export class TweetMedia {
  @Prop({ required: true, enum: ['image', 'video', 'gif'] })
  type: string;

  @Prop({ required: true })
  url: string;

  @Prop()
  thumbnailUrl: string;
}

@Schema({ timestamps: true })
export class Tweet {
  @Prop({ required: true, unique: true, index: true })
  tweetId: string;

  @Prop({ required: true })
  text: string;

  @Prop({ type: TweetAuthor, required: true })
  author: TweetAuthor;

  @Prop({ required: true, index: true })
  tweetCreatedAt: Date;

  @Prop({ default: Date.now })
  scrapedAt: Date;

  @Prop({ type: TweetMetrics })
  metrics: TweetMetrics;

  @Prop({ type: [TweetMedia] })
  media: TweetMedia[];

  @Prop({ type: [String], index: true })
  hashtags: string[];

  @Prop({ type: [String] })
  mentions: string[];

  @Prop({ type: [String] })
  urls: string[];

  @Prop()
  location: string;

  @Prop({
    required: true,
    enum: ['original', 'retweet', 'reply', 'quote'],
    index: true,
  })
  tweetType: string;

  @Prop()
  inReplyToTweetId: string;

  @Prop()
  quotedTweetId: string;

  @Prop()
  retweetedTweetId: string;

  @Prop()
  language: string;

  @Prop({ default: false })
  isThread: boolean;

  @Prop()
  threadPosition: number;
}

export const TweetSchema = SchemaFactory.createForClass(Tweet);

// Índices compuestos para búsquedas eficientes
TweetSchema.index({ 'author.username': 1, tweetCreatedAt: -1 });
TweetSchema.index({ hashtags: 1, tweetCreatedAt: -1 });
TweetSchema.index({ tweetType: 1, tweetCreatedAt: -1 });
