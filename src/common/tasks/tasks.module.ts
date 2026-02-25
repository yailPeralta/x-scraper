import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TwitterScraperModule } from '../../modules/twitter/scraper/twitter-scraper.module';
import { TrendingTweetsTask } from './trending-tweets.task';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TwitterScraperModule,
  ],
  providers: [TrendingTweetsTask],
})
export class TasksModule {}
