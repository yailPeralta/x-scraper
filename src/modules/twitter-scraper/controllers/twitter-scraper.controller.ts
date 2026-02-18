import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TwitterScraperService } from '../services/twitter-scraper.service';
import { TweetRepository } from '../repositories/tweet.repository';
import { GetTweetsByUsernameDto } from '../dto/get-tweets-by-username.dto';
import { SearchTweetsDto } from '../dto/search-tweets.dto';
import { LoginDto } from '../dto/login.dto';

@Controller('api/twitter')
export class TwitterScraperController {
  constructor(
    private readonly scraperService: TwitterScraperService,
    private readonly tweetRepository: TweetRepository,
  ) { }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    const success = await this.scraperService.login(
      loginDto.username,
      loginDto.password,
    );
    return { success, message: 'Login successful' };
  }

  @Get('tweets/username/:username')
  async getTweetsByUsername(
    @Param('username') username: string,
    @Query() query: GetTweetsByUsernameDto,
  ) {
    const tweets = await this.scraperService.getTweetsByUsername(username, {
      limit: query.limit,
      includeReplies: query.includeReplies,
      includeRetweets: query.includeRetweets,
      onlyReplies: query.onlyReplies
    });

    await this.tweetRepository.bulkUpsert(tweets);

    return {
      username,
      count: tweets.length,
      tweets,
    };
  }

  @Post('tweets/search')
  async searchTweets(@Body() searchDto: SearchTweetsDto) {
    const tweets = await this.scraperService.getTweetsFromSearchTerm(
      searchDto.searchTerm,
      {
        limit: searchDto.limit,
        filters: searchDto,
      },
    );

    await this.tweetRepository.bulkUpsert(tweets);

    return {
      searchTerm: searchDto.searchTerm,
      count: tweets.length,
      tweets,
    };
  }

  @Get('tweets/:tweetId')
  async getTweetById(@Param('tweetId') tweetId: string) {
    const tweet = await this.scraperService.getTweetById(tweetId);
    return tweet;
  }

  @Get('profile/:username')
  async getUserProfile(@Param('username') username: string) {
    const profile = await this.scraperService.getUserProfile(username);
    return profile;
  }

  @Get('stored/tweets')
  async getStoredTweets(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('username') username?: string,
  ) {
    const options = {
      skip: (page - 1) * limit,
      limit,
    };

    const tweets = username
      ? await this.tweetRepository.findByUsername(username, options)
      : await this.tweetRepository.findAll(options);

    return {
      page,
      limit,
      count: tweets.length,
      tweets,
    };
  }

  @Get('stored/stats')
  async getStats() {
    return await this.tweetRepository.getStats();
  }
}
