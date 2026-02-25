import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry, CronExpression } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { TrendingScraperService } from '../../modules/twitter/scraper/services/trending-scraper.service';

/**
 * Scheduled task that periodically scrapes trending tweets for the
 * CRYPTOCURRENCY topic from x.com/i/jf/global-trending/home.
 *
 * The cron expression is read from the env variable
 * TRENDING_TWEETS_CRON (default: "0 * * * *" — every hour).
 */
@Injectable()
export class TrendingTweetsTask implements OnModuleInit {
  private readonly logger = new Logger(TrendingTweetsTask.name);

  constructor(
    private readonly trendingScraperService: TrendingScraperService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    const cronExpression = this.configService.get<string>(
      'TRENDING_TWEETS_CRON',
    ) ?? 'EVERY_HOUR';

    const job = new CronJob(
      this.getCronExpression(cronExpression as string),
      () => {
        this.handleCryptocurrencyTrending();
      },
    );

    this.schedulerRegistry.addCronJob('trending-tweets-cryptocurrency', job);
    job.start();

    this.logger.log(
      `TrendingTweetsTask registered with cron: "${cronExpression}"`,
    );
  }

  private getCronExpression(expresion: string): string {
    return expresion in CronExpression
      ? CronExpression[expresion]
      : expresion;
  }

  async handleCryptocurrencyTrending(): Promise<void> {
    this.logger.log(
      'Cron triggered: scraping trending tweets for CRYPTOCURRENCY',
    );

    try {
      const tweets = await this.trendingScraperService.getTrendingTweetsByTopic(
        'CRYPTOCURRENCY',
        500,
      );

      this.logger.log(
        `Cron complete: ${tweets.length} trending tweets saved for CRYPTOCURRENCY`,
      );
    } catch (error) {
      this.logger.error(
        `Cron failed for CRYPTOCURRENCY trending tweets: ${error?.message}`,
        error?.stack,
      );
    }
  }
}
