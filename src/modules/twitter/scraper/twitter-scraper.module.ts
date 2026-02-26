import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { TwitterScraperController } from './controllers/twitter-scraper.controller';
import { TwitterScraperService } from './services/twitter-scraper.service';
import { TrendingScraperService } from './services/trending-scraper.service';
import { PlaywrightBrowserService } from './services/playwright-browser.service';
import { PlaywrightEngineService } from './services/playwright-engine.service';
import { CrawleeEngineService } from './services/crawlee-engine.service';
import { CrawleeService } from './services/crawlee.service';
import { TweetRepository } from './repositories/tweet.repository';
import { XUserRepository } from './repositories/x-user.repository';
import { TrendingTopicRepository } from './repositories/trending-topic.repository';
import {
  Tweet,
  TweetSchema,
} from '../../../common/database/mongodb/schemas/twitter/tweet.schema';
import {
  XUser,
  XUserSchema,
} from '../../../common/database/mongodb/schemas/twitter/x-user.schema';
import {
  TrendingTopic,
  TrendingTopicSchema,
} from '../../../common/database/mongodb/schemas/twitter/trending-topic.schema';
import { BROWSER_ENGINE_SERVICE } from './interfaces/browser-engine.interface';

/**
 * Factory provider that selects the browser engine implementation at runtime
 * based on the SCRAPER_ENGINE environment variable.
 *
 *  SCRAPER_ENGINE=crawlee    → CrawleeEngineService  (default, anti-detection)
 *                              USE_EXTRA=true adds playwright-extra + stealth as launcher
 *  SCRAPER_ENGINE=playwright → PlaywrightEngineService (persistent context)
 */
const browserEngineProvider = {
  provide: BROWSER_ENGINE_SERVICE,
  useFactory: (
    browserService: PlaywrightBrowserService,
    crawleeService: CrawleeService,
    configService: ConfigService,
  ) => {
    const engine = configService.get<string>('SCRAPER_ENGINE', 'crawlee');
    if (engine === 'playwright') {
      return new PlaywrightEngineService(browserService);
    }
    return new CrawleeEngineService(crawleeService);
  },
  inject: [PlaywrightBrowserService, CrawleeService, ConfigService],
};

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
    PlaywrightBrowserService,
    CrawleeService,
    browserEngineProvider,
    TwitterScraperService,
    TrendingScraperService,
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
