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
import { TrendingScraperService } from '../services/trending-scraper.service';
import { TweetRepository } from '../repositories/tweet.repository';
import { TrendingTopicRepository } from '../repositories/trending-topic.repository';
import { GetTweetsByUsernameDto } from '../dto/get-tweets-by-username.dto';
import { SearchTweetsDto } from '../dto/search-tweets.dto';
import { LoginDto } from '../dto/login.dto';
import { GetTrendingTweetsDto } from '../dto/get-trending-tweets.dto';

@Controller('api/twitter')
export class TwitterScraperController {
  constructor(
    private readonly scraperService: TwitterScraperService,
    private readonly trendingScraperService: TrendingScraperService,
    private readonly tweetRepository: TweetRepository,
    private readonly trendingTopicRepository: TrendingTopicRepository,
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
      includeRetweets: query.includeRetweets,
      onlyReplies: query.onlyReplies,
      includeQuoted: query.includeQuoted
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

  // ---------------------------------------------------------------------------
  // Trending tweets by topic
  // ---------------------------------------------------------------------------

  /**
   * GET /api/twitter/trending/topics
   * Returns the list of all available trending topics from the database.
   */
  @Get('trending/topics')
  async getTrendingTopics() {
    const topics = await this.trendingTopicRepository.findAll();
    return {
      count: topics.length,
      topics,
    };
  }

  /**
   * GET /api/twitter/trending/topic/:tag?limit=20
   * Scrapes trending tweets for the given topic tag from x.com/i/jf/global-trending/home
   * and persists them into the tweets collection with isTrending=true.
   *
   * @param tag  - Topic tag (e.g. CRYPTOCURRENCY). Case-insensitive.
   * @param query - Optional limit (default 20).
   */
  @Get('trending/topic/:tag')
  async getTrendingTweetsByTopic(
    @Param('tag') tag: string,
    @Query() query: GetTrendingTweetsDto,
  ) {
    const tweets = await this.trendingScraperService.getTrendingTweetsByTopic(
      tag.toUpperCase(),
      query.limit ?? 20,
    );

    return {
      tag: tag.toUpperCase(),
      count: tweets.length,
      tweets,
    };
  }

  /**
   * GET /api/twitter/trending/stored?page=1&limit=20
   * Returns stored trending tweets from the database (isTrending=true).
   */
  @Get('trending/stored')
  async getStoredTrendingTweets(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    const options = {
      skip: (page - 1) * limit,
      limit,
    };

    const tweets = await this.tweetRepository.findTrending(options);

    return {
      page,
      limit,
      count: tweets.length,
      tweets,
    };
  }

  /**
   * GET /api/twitter/trending/stored/:tag?page=1&limit=20
   * Returns stored trending tweets for a specific topic tag from the database.
   */
  @Get('trending/stored/:tag')
  async getStoredTrendingTweetsByTag(
    @Param('tag') tag: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    const options = {
      skip: (page - 1) * limit,
      limit,
    };

    const tweets = await this.tweetRepository.findByTrendingTopicTag(
      tag.toUpperCase(),
      options,
    );

    return {
      tag: tag.toUpperCase(),
      page,
      limit,
      count: tweets.length,
      tweets,
    };
  }
}
