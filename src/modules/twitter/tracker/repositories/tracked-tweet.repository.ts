import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  TrackedTweet,
  TrackedTweetDocument,
} from '../../../../common/database/mongodb/schemas/twitter/tracked-tweet.schema';

@Injectable()
export class TrackedTweetRepository {
  constructor(
    @InjectModel(TrackedTweet.name)
    private trackedTweetModel: Model<TrackedTweetDocument>,
  ) {}

  async create(data: Partial<TrackedTweet>): Promise<TrackedTweet> {
    const tweet = new this.trackedTweetModel(data);
    return tweet.save();
  }

  async findByTweetId(tweetId: string): Promise<TrackedTweet | null> {
    return this.trackedTweetModel.findOne({ tweetId }).exec();
  }

  async findByAuthorId(
    authorId: string,
    options: { skip?: number; limit?: number } = {},
  ): Promise<TrackedTweet[]> {
    return this.trackedTweetModel
      .find({ authorId })
      .sort({ tweetCreatedAt: -1 })
      .skip(options.skip || 0)
      .limit(options.limit || 20)
      .exec();
  }

  async findByTrackerId(
    trackerId: string,
    options: { skip?: number; limit?: number } = {},
  ): Promise<TrackedTweet[]> {
    return this.trackedTweetModel
      .find({ matchedTrackerIds: trackerId })
      .sort({ tweetCreatedAt: -1 })
      .skip(options.skip || 0)
      .limit(options.limit || 20)
      .exec();
  }

  async findByRuleTag(
    tag: string,
    options: { skip?: number; limit?: number } = {},
  ): Promise<TrackedTweet[]> {
    return this.trackedTweetModel
      .find({ matchedRuleTags: tag })
      .sort({ tweetCreatedAt: -1 })
      .skip(options.skip || 0)
      .limit(options.limit || 20)
      .exec();
  }

  async findByCashtag(
    cashtag: string,
    options: { skip?: number; limit?: number } = {},
  ): Promise<TrackedTweet[]> {
    return this.trackedTweetModel
      .find({ cashtags: cashtag })
      .sort({ tweetCreatedAt: -1 })
      .skip(options.skip || 0)
      .limit(options.limit || 20)
      .exec();
  }

  async findAll(
    options: { skip?: number; limit?: number } = {},
  ): Promise<TrackedTweet[]> {
    return this.trackedTweetModel
      .find()
      .sort({ tweetCreatedAt: -1 })
      .skip(options.skip || 0)
      .limit(options.limit || 20)
      .exec();
  }

  async bulkUpsert(tweets: Partial<TrackedTweet>[]): Promise<number> {
    const operations = tweets.map((tweet) => ({
      updateOne: {
        filter: { tweetId: tweet.tweetId },
        update: { $set: tweet },
        upsert: true,
      },
    }));

    const result = await this.trackedTweetModel.bulkWrite(operations);
    return result.upsertedCount + result.modifiedCount;
  }

  async delete(tweetId: string): Promise<boolean> {
    const result = await this.trackedTweetModel
      .deleteOne({ tweetId })
      .exec();
    return result.deletedCount > 0;
  }

  async count(): Promise<number> {
    return this.trackedTweetModel.countDocuments().exec();
  }
}
