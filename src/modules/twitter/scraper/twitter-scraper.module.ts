import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TwitterScraperController } from './controllers/twitter-scraper.controller';
import { TwitterScraperService } from './services/twitter-scraper.service';
import { TrendingScraperService } from './services/trending-scraper.service';
import { PlaywrightBrowserService } from './services/playwright-browser.service';
import { TweetRepository } from './repositories/tweet.repository';
import { XUserRepository } from './repositories/x-user.repository';
import { TrendingTopicRepository } from './repositories/trending-topic.repository';
import { Tweet, TweetSchema } from '../../../common/database/mongodb/schemas/twitter/tweet.schema';
import { XUser, XUserSchema } from '../../../common/database/mongodb/schemas/twitter/x-user.schema';
import {
  TrendingTopic,
  TrendingTopicSchema,
} from '../../../common/database/mongodb/schemas/twitter/trending-topic.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Tweet.name, schema: TweetSchema },
      { name: XUser.name, schema: XUserSchema },
      { name: TrendingTopic.name, schema: TrendingTopicSchema },
    ]),
  ],
  controllers: [TwitterScraperController],
  providers: [
    TwitterScraperService,
    TrendingScraperService,
    PlaywrightBrowserService,
    TweetRepository,
    XUserRepository,
    TrendingTopicRepository,
  ],
  exports: [
    TwitterScraperService,
    TrendingScraperService,
    TweetRepository,
    XUserRepository,
    TrendingTopicRepository,
  ],
})
export class TwitterScraperModule {}
