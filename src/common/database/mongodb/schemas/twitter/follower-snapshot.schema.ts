import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type FollowerSnapshotDocument = FollowerSnapshot & Document;

@Schema({ timestamps: true })
export class FollowerSnapshot {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  username: string;

  @Prop({ default: 0 })
  followersCount: number;

  @Prop({ default: 0 })
  followingCount: number;

  @Prop({ required: true, index: true })
  snapshotAt: Date;
}

export const FollowerSnapshotSchema =
  SchemaFactory.createForClass(FollowerSnapshot);

FollowerSnapshotSchema.index({ userId: 1, snapshotAt: -1 });
