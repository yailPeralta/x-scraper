import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  UserProfileSnapshot,
  UserProfileSnapshotDocument,
} from '../../../../common/database/mongodb/schemas/twitter/user-profile-snapshot.schema';

@Injectable()
export class UserProfileSnapshotRepository {
  constructor(
    @InjectModel(UserProfileSnapshot.name)
    private snapshotModel: Model<UserProfileSnapshotDocument>,
  ) {}

  async create(
    data: Partial<UserProfileSnapshot>,
  ): Promise<UserProfileSnapshot> {
    const snapshot = new this.snapshotModel(data);
    return snapshot.save();
  }

  async findLatestByUserId(
    userId: string,
  ): Promise<UserProfileSnapshot | null> {
    return this.snapshotModel
      .findOne({ userId })
      .sort({ snapshotAt: -1 })
      .exec();
  }

  async findByUserId(
    userId: string,
    options: { skip?: number; limit?: number } = {},
  ): Promise<UserProfileSnapshot[]> {
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
  ): Promise<UserProfileSnapshot[]> {
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
