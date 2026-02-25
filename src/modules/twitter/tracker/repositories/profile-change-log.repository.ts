import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ProfileChangeLog,
  ProfileChangeLogDocument,
} from '../../../../common/database/mongodb/schemas/twitter/profile-change-log.schema';

@Injectable()
export class ProfileChangeLogRepository {
  constructor(
    @InjectModel(ProfileChangeLog.name)
    private changeLogModel: Model<ProfileChangeLogDocument>,
  ) {}

  async create(data: Partial<ProfileChangeLog>): Promise<ProfileChangeLog> {
    const log = new this.changeLogModel(data);
    return log.save();
  }

  async createMany(data: Partial<ProfileChangeLog>[]): Promise<any[]> {
    return this.changeLogModel.insertMany(data);
  }

  async findByUserId(
    userId: string,
    options: { skip?: number; limit?: number } = {},
  ): Promise<ProfileChangeLog[]> {
    return this.changeLogModel
      .find({ userId })
      .sort({ detectedAt: -1 })
      .skip(options.skip || 0)
      .limit(options.limit || 20)
      .exec();
  }

  async findByUserIdAndField(
    userId: string,
    field: string,
    options: { skip?: number; limit?: number } = {},
  ): Promise<ProfileChangeLog[]> {
    return this.changeLogModel
      .find({ userId, field })
      .sort({ detectedAt: -1 })
      .skip(options.skip || 0)
      .limit(options.limit || 20)
      .exec();
  }

  async findByUserIdInRange(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<ProfileChangeLog[]> {
    return this.changeLogModel
      .find({
        userId,
        detectedAt: { $gte: from, $lte: to },
      })
      .sort({ detectedAt: -1 })
      .exec();
  }

  async findAll(
    options: { skip?: number; limit?: number } = {},
  ): Promise<ProfileChangeLog[]> {
    return this.changeLogModel
      .find()
      .sort({ detectedAt: -1 })
      .skip(options.skip || 0)
      .limit(options.limit || 50)
      .exec();
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.changeLogModel.findByIdAndDelete(id).exec();
    return result !== null;
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.changeLogModel
      .deleteMany({ detectedAt: { $lt: date } })
      .exec();
    return result.deletedCount;
  }
}
