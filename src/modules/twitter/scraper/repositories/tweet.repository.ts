import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Tweet, TweetDocument } from '../../../../common/database/mongodb/schemas/twitter/tweet.schema';
import { XUser, XUserDocument } from '../../../../common/database/mongodb/schemas/twitter/x-user.schema';

@Injectable()
export class TweetRepository {
  constructor(
    @InjectModel(Tweet.name) private tweetModel: Model<TweetDocument>,
    @InjectModel(XUser.name) private xUserModel: Model<XUserDocument>,
  ) {}

  async create(tweetData: Partial<Tweet>): Promise<Tweet> {
    const tweet = new this.tweetModel(tweetData);
    return tweet.save();
  }

  async findById(tweetId: string): Promise<Tweet | null> {
    return this.tweetModel.findOne({ tweetId }).populate('author').exec();
  }

  async findByUsername(
    username: string,
    options: { skip?: number; limit?: number } = {},
  ): Promise<Tweet[]> {
    const user = await this.xUserModel.findOne({ username }).exec();
    if (!user) return [];

    return this.tweetModel
      .find({ author: user._id as any })
      .populate('author')
      .sort({ tweetCreatedAt: -1 })
      .skip(options.skip || 0)
      .limit(options.limit || 20)
      .exec();
  }

  async findAll(
    options: { skip?: number; limit?: number } = {},
  ): Promise<Tweet[]> {
    return this.tweetModel
      .find()
      .populate('author')
      .sort({ tweetCreatedAt: -1 })
      .skip(options.skip || 0)
      .limit(options.limit || 20)
      .exec();
  }

  async bulkUpsert(tweets: Partial<Tweet>[]): Promise<number> {
    const operations = tweets.map((tweet) => {
      return {
        updateOne: {
          filter: { tweetId: tweet.tweetId },
          update: { $set: tweet },
          upsert: true,
        },
      };
    });

    const result = await this.tweetModel.bulkWrite(operations);
    return result.upsertedCount + result.modifiedCount;
  }

  async delete(tweetId: string): Promise<boolean> {
    const result = await this.tweetModel.deleteOne({ tweetId }).exec();
    return result.deletedCount > 0;
  }

  async getStats(): Promise<any> {
    const totalTweets = await this.tweetModel.countDocuments().exec();
    const uniqueUsers = await this.tweetModel.distinct('author').exec();

    const tweetsByType = await this.tweetModel.aggregate([
      {
        $group: {
          _id: '$tweetType',
          count: { $sum: 1 },
        },
      },
    ]);

    const topHashtags = await this.tweetModel.aggregate([
      { $unwind: '$hashtags' },
      {
        $group: {
          _id: '$hashtags',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    return {
      totalTweets,
      uniqueUsers: uniqueUsers.length,
      tweetsByType,
      topHashtags,
    };
  }

  // ---------------------------------------------------------------------------
  // Trending tweet queries
  // ---------------------------------------------------------------------------

  /**
   * Find all tweets that were captured as part of a trending topic scrape.
   */
  async findTrending(
    options: { skip?: number; limit?: number } = {},
  ): Promise<Tweet[]> {
    return this.tweetModel
      .find({ isTrending: true } as any)
      .populate('author', 'username displayName verified')
      .populate('trendingTopic', 'tag nameEn nameEs')
      .sort({ scrapedAt: -1 })
      .skip(options.skip || 0)
      .limit(options.limit || 20)
      .exec();
  }

  /**
   * Find trending tweets associated with a specific TrendingTopic by its ObjectId.
   */
  async findByTrendingTopic(
    topicId: Types.ObjectId | string,
    options: { skip?: number; limit?: number } = {},
  ): Promise<Tweet[]> {
    return this.tweetModel
      .find({
        isTrending: true,
        trendingTopic: new Types.ObjectId(topicId.toString()),
      } as any)
      .populate('author', 'username displayName verified')
      .populate('trendingTopic', 'tag nameEn nameEs')
      .sort({ scrapedAt: -1 })
      .skip(options.skip || 0)
      .limit(options.limit || 20)
      .exec();
  }

  /**
   * Find trending tweets by topic tag string (e.g. "CRYPTOCURRENCY").
   * Uses an aggregation pipeline to join with the trendingtopics collection.
   */
  async findByTrendingTopicTag(
    tag: string,
    options: { skip?: number; limit?: number } = {},
  ): Promise<Tweet[]> {
    const pipeline: any[] = [
      { $match: { isTrending: true } },
      {
        $lookup: {
          from: 'trendingtopics',
          localField: 'trendingTopic',
          foreignField: '_id',
          as: 'trendingTopicDoc',
        },
      },
      { $unwind: '$trendingTopicDoc' },
      { $match: { 'trendingTopicDoc.tag': tag.toUpperCase() } },
      { $sort: { scrapedAt: -1 } },
      { $skip: options.skip || 0 },
      { $limit: options.limit || 20 },
    ];

    return this.tweetModel.aggregate(pipeline).exec();
  }

  /**
   * Count trending tweets for a specific TrendingTopic.
   */
  async countByTrendingTopic(topicId: Types.ObjectId | string): Promise<number> {
    return this.tweetModel
      .countDocuments({
        isTrending: true,
        trendingTopic: new Types.ObjectId(topicId.toString()),
      } as any)
      .exec();
  }
}
