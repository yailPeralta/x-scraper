import {
  Controller,
  Post,
  Delete,
  Body,
  Param,
  Get,
  Logger,
} from '@nestjs/common';
import { TwitterBotService } from '../services/twitter-bot.service';
import {
  BotPostDto,
  BotQuoteDto,
  BotReplyDto,
  BotRepostDto,
  BotLikeDto,
  BotFollowDto,
} from '../dto/bot-action.dto';

@Controller('bot')
export class BotController {
  private readonly logger = new Logger(BotController.name);

  constructor(private readonly botService: TwitterBotService) {}

  /**
   * GET /bot/status — Check if bot write operations are enabled
   */
  @Get('status')
  getStatus() {
    return {
      data: {
        writeEnabled: this.botService.isWriteEnabled(),
      },
    };
  }

  /**
   * POST /bot/post — Create a new post
   */
  @Post('post')
  async createPost(@Body() dto: BotPostDto) {
    const result = await this.botService.createPost(dto.text, {
      mediaIds: dto.mediaIds,
      replySettings: dto.replySettings,
    });
    return { data: result };
  }

  /**
   * POST /bot/quote — Quote a tweet
   */
  @Post('quote')
  async quoteTweet(@Body() dto: BotQuoteDto) {
    const result = await this.botService.quoteTweet(
      dto.text,
      dto.quotedTweetId,
    );
    return { data: result };
  }

  /**
   * POST /bot/reply — Reply to a tweet
   */
  @Post('reply')
  async replyToTweet(@Body() dto: BotReplyDto) {
    const result = await this.botService.replyToTweet(
      dto.text,
      dto.inReplyToTweetId,
    );
    return { data: result };
  }

  /**
   * POST /bot/repost — Retweet a post
   */
  @Post('repost')
  async repost(@Body() dto: BotRepostDto) {
    const result = await this.botService.repost(dto.tweetId);
    return { data: result };
  }

  /**
   * POST /bot/like — Like a post
   */
  @Post('like')
  async likeTweet(@Body() dto: BotLikeDto) {
    const result = await this.botService.likeTweet(dto.tweetId);
    return { data: result };
  }

  /**
   * DELETE /bot/like/:tweetId — Unlike a post
   */
  @Delete('like/:tweetId')
  async unlikeTweet(@Param('tweetId') tweetId: string) {
    const result = await this.botService.unlikeTweet(tweetId);
    return { data: result };
  }

  /**
   * POST /bot/follow — Follow a user
   */
  @Post('follow')
  async followUser(@Body() dto: BotFollowDto) {
    const result = await this.botService.followUser(dto.targetUserId);
    return { data: result };
  }

  /**
   * DELETE /bot/follow/:userId — Unfollow a user
   */
  @Delete('follow/:userId')
  async unfollowUser(@Param('userId') userId: string) {
    const result = await this.botService.unfollowUser(userId);
    return { data: result };
  }

  /**
   * DELETE /bot/post/:tweetId — Delete a tweet
   */
  @Delete('post/:tweetId')
  async deleteTweet(@Param('tweetId') tweetId: string) {
    const result = await this.botService.deleteTweet(tweetId);
    return { data: result };
  }
}
