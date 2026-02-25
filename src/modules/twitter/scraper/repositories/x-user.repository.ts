import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { XUser, XUserDocument } from '../../../../common/database/mongodb/schemas/twitter/x-user.schema';

@Injectable()
export class XUserRepository {
  constructor(
    @InjectModel(XUser.name)
    private xUserModel: Model<XUserDocument>,
  ) {}

  async upsert(userData: Partial<XUser>): Promise<XUser> {
    return this.xUserModel
      .findOneAndUpdate(
        { restId: userData.restId },
        { $set: userData },
        { upsert: true, returnDocument: 'after' },
      )
      .exec();
  }

  async findByUsername(username: string): Promise<XUser | null> {
    return this.xUserModel.findOne({ username }).exec();
  }

  async findAll(
    options: { skip?: number; limit?: number } = {},
  ): Promise<XUser[]> {
    return this.xUserModel
      .find()
      .sort({ createdAt: -1 })
      .skip(options.skip || 0)
      .limit(options.limit || 20)
      .exec();
  }

  async delete(username: string): Promise<boolean> {
    const result = await this.xUserModel.deleteOne({ username }).exec();
    return result.deletedCount > 0;
  }

  /**
   * Search users by username or displayName using a case-insensitive regex.
   */
  async search(query: string, limit = 20): Promise<XUser[]> {
    const regex = new RegExp(query, 'i');
    return this.xUserModel
      .find({ $or: [{ username: regex }, { displayName: regex }] })
      .limit(limit)
      .exec();
  }

  /**
   * Find a user by their X rest_id (numeric string).
   */
  async findByRestId(restId: string): Promise<XUser | null> {
    return this.xUserModel.findOne({ restId }).exec();
  }

  /**
   * Find multiple users by their MongoDB ObjectIds.
   */
  async findByIds(ids: Types.ObjectId[]): Promise<XUser[]> {
    return this.xUserModel.find({ _id: { $in: ids } }).exec();
  }
}
