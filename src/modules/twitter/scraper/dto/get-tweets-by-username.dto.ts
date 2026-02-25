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
  includeRetweets?: boolean = false;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeQuoted?: boolean = false;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  onlyReplies?: boolean = false;
}
