import { IsOptional, IsNumber, IsBoolean, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class GetTweetsByUsernameDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeReplies?: boolean = false;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeRetweets?: boolean = true;
}
