import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SearchTweetsDto {
  @IsString()
  searchTerm: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(500)
  limit?: number = 50;

  @IsOptional()
  @IsString()
  exactPhrase?: string;

  @IsOptional()
  @IsString({ each: true })
  anyOfTheseWords?: string[];

  @IsOptional()
  @IsString({ each: true })
  noneOfTheseWords?: string[];

  @IsOptional()
  @IsString({ each: true })
  hashtags?: string[];

  @IsOptional()
  @IsString()
  lang?: string;

  @IsOptional()
  @IsString({ each: true })
  fromAccounts?: string[];

  @IsOptional()
  @IsString({ each: true })
  toAccounts?: string[];

  @IsOptional()
  @IsString({ each: true })
  mentioningAccounts?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minReplies?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minFaves?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minRetweets?: number;

  @IsOptional()
  @IsString()
  since?: string;

  @IsOptional()
  @IsString()
  until?: string;
}
