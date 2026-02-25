import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  EngagementSnapshot,
  EngagementSnapshotDocument,
} from '../../../../common/database/mongodb/schemas/twitter/engagement-snapshot.schema';

@Injectable()
export class EngagementSnapshotRepository {
  constructor(
    @InjectModel(EngagementSnapshot.name)
    private snapshotModel: Model<EngagementSnapshotDocument>,
  ) {}

  async create(data: Partial<EngagementSnapshot>): Promise<EngagementSnapshot> {
    const snapshot = new this.snapshotModel(data);
    return snapshot.save();
  }

  async findLatestByTweetId(
    tweetId: string,
  ): Promise<EngagementSnapshot | null> {
    return this.snapshotModel
      .findOne({ tweetId })
      .sort({ snapshotAt: -1 })
      .exec();
  }

  async findByTweetId(
    tweetId: string,
    options: { skip?: number; limit?: number } = {},
  ): Promise<EngagementSnapshot[]> {
    return this.snapshotModel
      .find({ tweetId })
      .sort({ snapshotAt: -1 })
      .skip(options.skip || 0)
      .limit(options.limit || 20)
      .exec();
  }

  async findByAuthorId(
    authorId: string,
    options: { skip?: number; limit?: number } = {},
  ): Promise<EngagementSnapshot[]> {
    return this.snapshotModel
      .find({ authorId })
      .sort({ snapshotAt: -1 })
      .skip(options.skip || 0)
      .limit(options.limit || 20)
      .exec();
  }

  async findByTweetIdInRange(
    tweetId: string,
    from: Date,
    to: Date,
  ): Promise<EngagementSnapshot[]> {
    return this.snapshotModel
      .find({
        tweetId,
        snapshotAt: { $gte: from, $lte: to },
      })
      .sort({ snapshotAt: -1 })
      .exec();
  }

  async findRecentByTweetId(
    tweetId: string,
    count: number,
  ): Promise<EngagementSnapshot[]> {
    return this.snapshotModel
      .find({ tweetId })
      .sort({ snapshotAt: -1 })
      .limit(count)
      .exec();
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.snapshotModel.findByIdAndDelete(id).exec();
    return result !== null;
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.snapshotModel
      .deleteMany({ snapshotAt: { $lt: date } })
      .exec();
    return result.deletedCount;
  }
}
