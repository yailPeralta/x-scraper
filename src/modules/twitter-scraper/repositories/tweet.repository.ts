import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tweet, TweetDocument } from '../schemas/tweet.schema';

@Injectable()
export class TweetRepository {
  constructor(
    @InjectModel(Tweet.name) private tweetModel: Model<TweetDocument>,
  ) {}

  async create(tweetData: Partial<Tweet>): Promise<Tweet> {
    const tweet = new this.tweetModel(tweetData);
    return tweet.save();
  }

  async findById(tweetId: string): Promise<Tweet | null> {
    return this.tweetModel.findOne({ tweetId }).exec();
  }

  async findByUsername(
    username: string,
    options: { skip?: number; limit?: number } = {},
  ): Promise<Tweet[]> {
    return this.tweetModel
      .find({ 'author.username': username })
      .sort({ createdAt: -1 })
      .skip(options.skip || 0)
      .limit(options.limit || 20)
      .exec();
  }

  async findAll(
    options: { skip?: number; limit?: number } = {},
  ): Promise<Tweet[]> {
    return this.tweetModel
      .find()
      .sort({ createdAt: -1 })
      .skip(options.skip || 0)
      .limit(options.limit || 20)
      .exec();
  }

  async bulkUpsert(tweets: Partial<Tweet>[]): Promise<number> {
    const operations = tweets.map((tweet) => ({
      updateOne: {
        filter: { tweetId: tweet.tweetId },
        update: { $set: tweet },
        upsert: true,
      },
    }));

    const result = await this.tweetModel.bulkWrite(operations);
    return result.upsertedCount + result.modifiedCount;
  }

  async delete(tweetId: string): Promise<boolean> {
    const result = await this.tweetModel.deleteOne({ tweetId }).exec();
    return result.deletedCount > 0;
  }

  async getStats(): Promise<any> {
    const totalTweets = await this.tweetModel.countDocuments().exec();
    const uniqueUsers = await this.tweetModel
      .distinct('author.username')
      .exec();

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
}
