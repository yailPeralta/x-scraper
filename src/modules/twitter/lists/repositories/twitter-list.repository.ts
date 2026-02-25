import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  TwitterList,
  TwitterListDocument,
} from '../../../../common/database/mongodb/schemas/twitter/twitter-list.schema';

@Injectable()
export class TwitterListRepository {
  constructor(
    @InjectModel(TwitterList.name)
    private readonly twitterListModel: Model<TwitterListDocument>,
  ) {}

  async upsert(listData: Partial<TwitterList>): Promise<TwitterList> {
    return this.twitterListModel
      .findOneAndUpdate(
        { xListId: listData.xListId },
        { $set: listData },
        { upsert: true, returnDocument: 'after' },
      )
      .exec();
  }

  async create(data: Partial<TwitterList>): Promise<TwitterListDocument> {
    const list = new this.twitterListModel(data);
    return list.save();
  }

  async findById(id: string): Promise<TwitterListDocument | null> {
    return this.twitterListModel.findById(id).exec();
  }

  // Find a list by ID and populate its members with XUser data.
  async findByIdPopulated(id: string): Promise<TwitterListDocument | null> {
    return this.twitterListModel.findById(id).populate('members').exec();
  }

  async findAll(
    options: { skip?: number; limit?: number } = {},
  ): Promise<TwitterListDocument[]> {
    return this.twitterListModel
      .find()
      .sort({ createdAt: -1 })
      .skip(options.skip || 0)
      .limit(options.limit || 50)
      .exec();
  }

  async update(
    id: string,
    data: Partial<TwitterList>,
  ): Promise<TwitterListDocument | null> {
    return this.twitterListModel
      .findByIdAndUpdate(id, { $set: data }, { returnDocument: 'after' })
      .exec();
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.twitterListModel.findByIdAndDelete(id).exec();
    return result !== null;
  }

  /**
   * Add a member to the list using $addToSet to avoid duplicates.
   */
  async addMember(
    listId: string,
    userId: Types.ObjectId,
  ): Promise<TwitterListDocument | null> {
    return this.twitterListModel
      .findByIdAndUpdate(
        listId,
        { $addToSet: { members: userId } },
        { returnDocument: 'after' },
      )
      .exec();
  }

  /**
   * Remove a member from the list using $pull.
   */
  async removeMember(
    listId: string,
    userId: Types.ObjectId,
  ): Promise<TwitterListDocument | null> {
    return this.twitterListModel
      .findByIdAndUpdate(
        listId,
        { $pull: { members: userId } },
        { returnDocument: 'after' },
      )
      .exec();
  }

  async count(): Promise<number> {
    return this.twitterListModel.countDocuments().exec();
  }
}
