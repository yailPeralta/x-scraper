import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { XdkClientService } from '../../../../../common/services/twitter/xdk-client.service';
import { TrendSnapshotRepository } from '../../repositories/trend-snapshot.repository';
import { TrackerConfigRepository } from '../../repositories/tracker-config.repository';
import { TrackerType, TrackerStatus } from '../../interfaces/tracker-type.enum';
import { TrackerEvent } from '../../interfaces/tracker-event.interface';
import {
  DEFAULT_TREND_POLL_INTERVAL,
  DEFAULT_TREND_WOEID,
} from '../../constants/tracker.constants';
import { EnvironmentVariables } from '../../../../../common/config/env.validation';

@Injectable()
export class TrendTrackerService implements OnModuleDestroy {
  private readonly logger = new Logger(TrendTrackerService.name);
  private pollIntervals = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    private readonly xdkClient: XdkClientService,
    private readonly trendSnapshotRepo: TrendSnapshotRepository,
    private readonly trackerConfigRepo: TrackerConfigRepository,
    private readonly configService: ConfigService<EnvironmentVariables>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleDestroy(): void {
    for (const [, interval] of this.pollIntervals) {
      clearInterval(interval);
    }
    this.pollIntervals.clear();
  }

  async start(trackerId: string): Promise<void> {
    const config = await this.trackerConfigRepo.findById(trackerId);
    if (!config) throw new Error(`Tracker config not found: ${trackerId}`);

    const woeid =
      config.config?.woeid ||
      this.configService.get<number>('TRACKER_TREND_WOEID') ||
      DEFAULT_TREND_WOEID;

    // Take initial snapshot
    await this.pollTrends(trackerId, woeid, config.config?.filterKeywords);

    const pollInterval =
      this.configService.get<number>('TRACKER_TREND_POLL_INTERVAL') ||
      DEFAULT_TREND_POLL_INTERVAL;

    const interval = setInterval(() => {
      this.pollTrends(trackerId, woeid, config.config?.filterKeywords).catch(
        (error) => {
          this.logger.error(
            `Trend poll error for tracker ${trackerId}: ${error?.message || error}`,
          );
        },
      );
    }, pollInterval);

    this.pollIntervals.set(trackerId, interval);
    await this.trackerConfigRepo.updateStatus(trackerId, TrackerStatus.ACTIVE);

    this.logger.log(
      `TrendTracker started for WOEID ${woeid}, polling every ${pollInterval}ms (tracker: ${trackerId})`,
    );
  }

  async stop(trackerId: string): Promise<void> {
    const interval = this.pollIntervals.get(trackerId);
    if (interval) {
      clearInterval(interval);
      this.pollIntervals.delete(trackerId);
    }

    await this.trackerConfigRepo.updateStatus(trackerId, TrackerStatus.PAUSED);
    this.logger.log(`TrendTracker stopped (tracker: ${trackerId})`);
  }

  private async pollTrends(
    trackerId: string,
    woeid: number,
    filterKeywords?: string[],
  ): Promise<void> {
    try {
      const response = await this.xdkClient.readClient.trends.getByWoeid(woeid);

      const trends = (response?.data || []).map((t: any) => ({
        trendName: t.trendName || t.trend_name || '',
        tweetCount: t.tweetCount || t.tweet_count || 0,
      }));

      // Get previous snapshot for comparison
      const previousSnapshot =
        await this.trendSnapshotRepo.findLatestByWoeid(woeid);

      // Save new snapshot
      await this.trendSnapshotRepo.create({
        woeid,
        trends,
        snapshotAt: new Date(),
      });

      // Compare with previous snapshot
      if (previousSnapshot) {
        const previousTrendNames = new Set(
          previousSnapshot.trends.map((t: any) => t.trendName),
        );
        const currentTrendNames = new Set(trends.map((t: any) => t.trendName));

        // Detect new trends
        const newTrends = trends.filter(
          (t: any) => !previousTrendNames.has(t.trendName),
        );

        // Detect disappeared trends
        const disappearedTrends = previousSnapshot.trends.filter(
          (t: any) => !currentTrendNames.has(t.trendName),
        );

        // Detect trends gaining momentum
        const risingTrends = trends.filter((t: any) => {
          const prev = previousSnapshot.trends.find(
            (pt: any) => pt.trendName === t.trendName,
          );
          return prev && t.tweetCount > prev.tweetCount * 1.2; // 20% increase
        });

        // Apply keyword filter if configured
        const matchesFilter = (trendName: string) => {
          if (!filterKeywords || filterKeywords.length === 0) return true;
          const lower = trendName.toLowerCase();
          return filterKeywords.some((kw) => lower.includes(kw.toLowerCase()));
        };

        // Emit events for new trends
        for (const trend of newTrends) {
          if (matchesFilter(trend.trendName)) {
            const trackerEvent: TrackerEvent = {
              trackerId,
              trackerType: TrackerType.TREND,
              eventType: 'new_trend',
              data: {
                trendName: trend.trendName,
                tweetCount: trend.tweetCount,
                woeid,
              },
              timestamp: new Date(),
            };
            this.eventEmitter.emit('tracker.event', trackerEvent);
          }
        }

        // Emit events for rising trends
        for (const trend of risingTrends) {
          if (matchesFilter(trend.trendName)) {
            const prev = previousSnapshot.trends.find(
              (pt: any) => pt.trendName === trend.trendName,
            );
            const trackerEvent: TrackerEvent = {
              trackerId,
              trackerType: TrackerType.TREND,
              eventType: 'rising_trend',
              data: {
                trendName: trend.trendName,
                previousTweetCount: prev?.tweetCount || 0,
                currentTweetCount: trend.tweetCount,
                woeid,
              },
              timestamp: new Date(),
            };
            this.eventEmitter.emit('tracker.event', trackerEvent);
          }
        }

        // Emit events for disappeared trends
        for (const trend of disappearedTrends) {
          if (matchesFilter(trend.trendName)) {
            const trackerEvent: TrackerEvent = {
              trackerId,
              trackerType: TrackerType.TREND,
              eventType: 'trend_disappeared',
              data: {
                trendName: trend.trendName,
                lastTweetCount: trend.tweetCount,
                woeid,
              },
              timestamp: new Date(),
            };
            this.eventEmitter.emit('tracker.event', trackerEvent);
          }
        }

        if (newTrends.length > 0 || risingTrends.length > 0) {
          this.logger.log(
            `Trend changes detected: ${newTrends.length} new, ${risingTrends.length} rising, ${disappearedTrends.length} disappeared`,
          );
        }
      }

      await this.trackerConfigRepo.updateLastRunAt(trackerId);
    } catch (error) {
      this.logger.error(
        `Failed to poll trends for tracker ${trackerId}: ${error?.message || error}`,
      );
      await this.trackerConfigRepo.updateStatus(
        trackerId,
        TrackerStatus.ERROR,
        error?.message || 'Trend poll failed',
      );
    }
  }
}
