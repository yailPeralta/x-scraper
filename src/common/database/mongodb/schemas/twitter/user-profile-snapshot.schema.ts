import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserProfileSnapshotDocument = UserProfileSnapshot & Document;

@Schema({ timestamps: true })
export class UserProfileSnapshot {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  username: string;

  @Prop()
  displayName: string;

  @Prop()
  bio: string;

  @Prop()
  profileImageUrl: string;

  @Prop()
  profileBannerUrl: string;

  @Prop()
  location: string;

  @Prop()
  url: string;

  @Prop({ default: false })
  verified: boolean;

  @Prop()
  verifiedType: string;

  @Prop()
  subscriptionType: string;

  @Prop({ default: 0 })
  followersCount: number;

  @Prop({ default: 0 })
  followingCount: number;

  @Prop({ default: 0 })
  tweetCount: number;

  @Prop({ default: 0 })
  listedCount: number;

  @Prop({ required: true, index: true })
  snapshotAt: Date;
}

export const UserProfileSnapshotSchema =
  SchemaFactory.createForClass(UserProfileSnapshot);

UserProfileSnapshotSchema.index({ userId: 1, snapshotAt: -1 });
