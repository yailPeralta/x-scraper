import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ProfileChangeLogDocument = ProfileChangeLog & Document;

@Schema({ timestamps: true })
export class ProfileChangeLog {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  username: string;

  @Prop({ required: true })
  field: string;

  @Prop()
  oldValue: string;

  @Prop()
  newValue: string;

  @Prop({ required: true, index: true })
  detectedAt: Date;

  @Prop({ required: true, enum: ['activity_stream', 'polling'] })
  source: 'activity_stream' | 'polling';
}

export const ProfileChangeLogSchema =
  SchemaFactory.createForClass(ProfileChangeLog);

ProfileChangeLogSchema.index({ userId: 1, detectedAt: -1 });
