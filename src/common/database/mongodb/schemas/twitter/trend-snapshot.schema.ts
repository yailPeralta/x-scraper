import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TrendSnapshotDocument = TrendSnapshot & Document;

@Schema({ _id: false })
export class TrendItem {
  @Prop({ required: true })
  trendName: string;

  @Prop({ default: 0 })
  tweetCount: number;
}

@Schema({ timestamps: true })
export class TrendSnapshot {
  @Prop({ required: true, index: true })
  woeid: number;

  @Prop({ type: [TrendItem], default: [] })
  trends: TrendItem[];

  @Prop({ required: true, index: true })
  snapshotAt: Date;
}

export const TrendSnapshotSchema =
  SchemaFactory.createForClass(TrendSnapshot);

TrendSnapshotSchema.index({ woeid: 1, snapshotAt: -1 });
