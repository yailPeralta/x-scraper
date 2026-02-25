import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { TrackerType, TrackerStatus } from 'src/modules/twitter/tracker/interfaces/tracker-type.enum';

export type TrackerConfigDocument = TrackerConfig & Document;

@Schema({ timestamps: true })
export class TrackerConfig {
  @Prop({ required: true })
  name: string;

  @Prop({ type: String, enum: TrackerType, required: true, index: true })
  type: TrackerType;

  @Prop({
    type: String,
    enum: TrackerStatus,
    required: true,
    default: TrackerStatus.ACTIVE,
    index: true,
  })
  status: TrackerStatus;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  config: Record<string, any>;

  @Prop({ type: [String], default: [] })
  streamRuleIds: string[];

  @Prop()
  lastRunAt: Date;

  @Prop({ type: String })
  errorMessage: string | null;
}

export const TrackerConfigSchema = SchemaFactory.createForClass(TrackerConfig);

TrackerConfigSchema.index({ type: 1, status: 1 });
