import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  FollowerSnapshot,
  FollowerSnapshotDocument,
} from '../../../../common/database/mongodb/schemas/twitter/follower-snapshot.schema';

@Injectable()
export class FollowerSnapshotRepository {
  constructor(
    @InjectModel(FollowerSnapshot.name)
    private snapshotModel: Model<FollowerSnapshotDocument>,
  ) {}

  async create(data: Partial<FollowerSnapshot>): Promise<FollowerSnapshot> {
    const snapshot = new this.snapshotModel(data);
    return snapshot.save();
  }

  async findLatestByUserId(userId: string): Promise<FollowerSnapshot | null> {
    return this.snapshotModel
      .findOne({ userId })
      .sort({ snapshotAt: -1 })
      .exec();
  }

  async findByUserId(
    userId: string,
    options: { skip?: number; limit?: number } = {},
  ): Promise<FollowerSnapshot[]> {
    return this.snapshotModel
      .find({ userId })
      .sort({ snapshotAt: -1 })
      .skip(options.skip || 0)
      .limit(options.limit || 20)
      .exec();
  }

  async findByUserIdInRange(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<FollowerSnapshot[]> {
    return this.snapshotModel
      .find({
        userId,
        snapshotAt: { $gte: from, $lte: to },
      })
      .sort({ snapshotAt: -1 })
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
