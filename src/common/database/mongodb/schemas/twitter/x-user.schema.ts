import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type XUserDocument = XUser & Document;

@Schema({ timestamps: true })
export class XUser {
  @Prop({ index: true, unique: true })
  restId: string;

  @Prop({ required: true, unique: true, index: true })
  username: string;

  @Prop()
  displayName: string;

  @Prop()
  bio: string;

  @Prop()
  location: string;

  @Prop()
  joinDate: string;

  @Prop({ default: 0 })
  followers: number;

  @Prop({ default: 0 })
  following: number;

  @Prop({ default: false })
  verified: boolean;

  @Prop()
  profileImageUrl: string;

  @Prop()
  headerImageUrl: string;

  @Prop({ type: [String], default: [] })
  accountInfo: string[];
}

export const XUserSchema = SchemaFactory.createForClass(XUser);
