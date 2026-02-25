import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  TrendSnapshot,
  TrendSnapshotDocument,
} from '../../../../common/database/mongodb/schemas/twitter/trend-snapshot.schema';

@Injectable()
export class TrendSnapshotRepository {
  constructor(
    @InjectModel(TrendSnapshot.name)
    private snapshotModel: Model<TrendSnapshotDocument>,
  ) {}

  async create(data: Partial<TrendSnapshot>): Promise<TrendSnapshot> {
    const snapshot = new this.snapshotModel(data);
    return snapshot.save();
  }

  async findLatestByWoeid(woeid: number): Promise<TrendSnapshot | null> {
    return this.snapshotModel
      .findOne({ woeid })
      .sort({ snapshotAt: -1 })
      .exec();
  }

  async findByWoeid(
    woeid: number,
    options: { skip?: number; limit?: number } = {},
  ): Promise<TrendSnapshot[]> {
    return this.snapshotModel
      .find({ woeid })
      .sort({ snapshotAt: -1 })
      .skip(options.skip || 0)
      .limit(options.limit || 20)
      .exec();
  }

  async findByWoeidInRange(
    woeid: number,
    from: Date,
    to: Date,
  ): Promise<TrendSnapshot[]> {
    return this.snapshotModel
      .find({
        woeid,
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
