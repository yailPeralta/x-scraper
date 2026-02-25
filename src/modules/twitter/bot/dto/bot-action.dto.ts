import { IsString, IsOptional, IsArray, IsEnum } from 'class-validator';

export class BotPostDto {
  @IsString()
  text: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaIds?: string[];

  @IsOptional()
  @IsEnum(['following', 'mentionedUsers', 'subscribers', 'verified'])
  replySettings?: 'following' | 'mentionedUsers' | 'subscribers' | 'verified';
}

export class BotQuoteDto {
  @IsString()
  text: string;

  @IsString()
  quotedTweetId: string;
}

export class BotReplyDto {
  @IsString()
  text: string;

  @IsString()
  inReplyToTweetId: string;
}

export class BotRepostDto {
  @IsString()
  tweetId: string;
}

export class BotLikeDto {
  @IsString()
  tweetId: string;
}

export class BotFollowDto {
  @IsString()
  targetUserId: string;
}
