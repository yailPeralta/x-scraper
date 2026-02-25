import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  TrackerConfig,
  TrackerConfigDocument,
} from '../../../../common/database/mongodb/schemas/twitter/tracker-config.schema';
import { TrackerType, TrackerStatus } from '../interfaces/tracker-type.enum';

@Injectable()
export class TrackerConfigRepository {
  constructor(
    @InjectModel(TrackerConfig.name)
    private trackerConfigModel: Model<TrackerConfigDocument>,
  ) {}

  async create(data: Partial<TrackerConfig>): Promise<TrackerConfig> {
    const config = new this.trackerConfigModel(data);
    return config.save();
  }

  async findById(id: string): Promise<TrackerConfigDocument | null> {
    return this.trackerConfigModel.findById(id).exec();
  }

  async findByType(type: TrackerType): Promise<TrackerConfig[]> {
    return this.trackerConfigModel.find({ type }).exec();
  }

  async findActive(): Promise<TrackerConfig[]> {
    return this.trackerConfigModel
      .find({ status: TrackerStatus.ACTIVE })
      .exec();
  }

  async findActiveByType(type: TrackerType): Promise<TrackerConfig[]> {
    return this.trackerConfigModel
      .find({ type, status: TrackerStatus.ACTIVE })
      .exec();
  }

  async findAll(
    options: { skip?: number; limit?: number } = {},
  ): Promise<TrackerConfig[]> {
    return this.trackerConfigModel
      .find()
      .sort({ createdAt: -1 })
      .skip(options.skip || 0)
      .limit(options.limit || 50)
      .exec();
  }

  async update(
    id: string,
    data: Partial<TrackerConfig>,
  ): Promise<TrackerConfig | null> {
    return this.trackerConfigModel
      .findByIdAndUpdate(id, { $set: data }, { returnDocument: 'after' })
      .exec();
  }

  async updateStatus(
    id: string,
    status: TrackerStatus,
    errorMessage?: string | null,
  ): Promise<TrackerConfig | null> {
    const updateData: Partial<TrackerConfig> = { status };
    if (errorMessage !== undefined) {
      updateData.errorMessage = errorMessage;
    }
    return this.update(id, updateData);
  }

  async updateLastRunAt(id: string): Promise<TrackerConfig | null> {
    return this.update(id, { lastRunAt: new Date() });
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.trackerConfigModel.findByIdAndDelete(id).exec();
    return result !== null;
  }

  async count(): Promise<number> {
    return this.trackerConfigModel.countDocuments().exec();
  }
}
