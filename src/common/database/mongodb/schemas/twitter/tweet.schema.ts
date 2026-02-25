import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { XUser } from './x-user.schema';
import { TrendingTopic } from './trending-topic.schema';

export type TweetDocument = Tweet & Document;

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

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: XUser.name, required: true })
  author: XUser;

  @Prop({ required: true, index: true })
  tweetCreatedAt: Date;

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

  // ---------------------------------------------------------------------------
  // Trending fields — only populated when isTrending is true
  // ---------------------------------------------------------------------------

  /** Whether this tweet was captured as part of a trending topic scrape. */
  @Prop({ default: false, index: true })
  isTrending: boolean;

  /**
   * Reference to the TrendingTopic this tweet was associated with.
   * Only set when isTrending is true.
   */
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: TrendingTopic.name,
    index: true,
  })
  trendingTopic: TrendingTopic;

  /** Exact datetime when the scraping run that captured this tweet occurred. */
  @Prop({ index: true })
  scrapedAt: Date;

  /**
   * Date-only field (stored as midnight UTC) representing the calendar day
   * on which the trending scrape was performed.
   * Useful for grouping/filtering trending tweets by day.
   */
  @Prop({ index: true })
  trendDate: Date;
}

export const TweetSchema = SchemaFactory.createForClass(Tweet);

// Índices compuestos para búsquedas eficientes
TweetSchema.index({ author: 1, tweetCreatedAt: -1 });
TweetSchema.index({ hashtags: 1, tweetCreatedAt: -1 });
TweetSchema.index({ tweetType: 1, tweetCreatedAt: -1 });

// Índices compuestos para trending tweets
TweetSchema.index({ isTrending: 1, trendDate: -1 });
TweetSchema.index({ trendingTopic: 1, trendDate: -1 });
TweetSchema.index({ trendingTopic: 1, scrapedAt: -1 });
