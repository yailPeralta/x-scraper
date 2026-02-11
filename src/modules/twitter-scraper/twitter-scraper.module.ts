import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TwitterScraperController } from './controllers/twitter-scraper.controller';
import { TwitterScraperService } from './services/twitter-scraper.service';
import { PlaywrightBrowserService } from './services/playwright-browser.service';
import { TweetRepository } from './repositories/tweet.repository';
import { Tweet, TweetSchema } from './schemas/tweet.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Tweet.name, schema: TweetSchema }]),
  ],
  controllers: [TwitterScraperController],
  providers: [TwitterScraperService, PlaywrightBrowserService, TweetRepository],
  exports: [TwitterScraperService, TweetRepository],
})
export class TwitterScraperModule {}
