import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  IsNumber,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TrackerType } from '../interfaces/tracker-type.enum';

export class TrackerThresholdsDto {
  @IsOptional()
  @IsNumber()
  likesPerMinute?: number;

  @IsOptional()
  @IsNumber()
  retweetsPerMinute?: number;

  @IsOptional()
  @IsNumber()
  repliesPerMinute?: number;
}

export class TrackerConfigDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  usernames?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hashtags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cashtags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  trackedUserIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  trackedFields?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  trackedPostIds?: string[];

  @IsOptional()
  @IsNumber()
  woeid?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  filterKeywords?: string[];

  @IsOptional()
  @IsNumber()
  velocityAlertThreshold?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => TrackerThresholdsDto)
  thresholds?: TrackerThresholdsDto;
}

export class CreateTrackerDto {
  @IsString()
  name: string;

  @IsEnum(TrackerType)
  type: TrackerType;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TrackerConfigDto)
  config?: TrackerConfigDto;
}
