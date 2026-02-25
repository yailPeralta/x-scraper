import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  TrendingTopic,
  TrendingTopicDocument,
} from '../../../../common/database/mongodb/schemas/twitter/trending-topic.schema';

@Injectable()
export class TrendingTopicRepository {
  constructor(
    @InjectModel(TrendingTopic.name)
    private topicModel: Model<TrendingTopicDocument>,
  ) {}

  async findAll(): Promise<TrendingTopic[]> {
    return this.topicModel.find().sort({ tag: 1 }).exec();
  }

  async findByTag(tag: string): Promise<TrendingTopic | null> {
    return this.topicModel.findOne({ tag: tag.toUpperCase() }).exec();
  }

  async upsert(data: Partial<TrendingTopic>): Promise<TrendingTopic> {
    return this.topicModel
      .findOneAndUpdate(
        { tag: data.tag },
        { $set: data },
        { upsert: true, new: true },
      )
      .exec();
  }
}
