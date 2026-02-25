import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { XdkClientService } from '../../../../../common/services/twitter/xdk-client.service';
import { EngagementSnapshotRepository } from '../../repositories/engagement-snapshot.repository';
import { TrackerConfigRepository } from '../../repositories/tracker-config.repository';
import {
  TrackerType,
  TrackerStatus,
} from '../../interfaces/tracker-type.enum';
import { TrackerEvent } from '../../interfaces/tracker-event.interface';
import {
  DEFAULT_ENGAGEMENT_POLL_INTERVAL,
  ENGAGEMENT_SPIKE_MULTIPLIER,
  ENGAGEMENT_MIN_SNAPSHOTS_FOR_SPIKE,
} from '../../constants/tracker.constants';
import { EnvironmentVariables } from '../../../../../common/config/env.validation';

@Injectable()
export class EngagementSpikeTrackerService implements OnModuleDestroy {
  private readonly logger = new Logger(EngagementSpikeTrackerService.name);
  private pollIntervals = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    private readonly xdkClient: XdkClientService,
    private readonly engagementSnapshotRepo: EngagementSnapshotRepository,
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

    const { trackedPostIds = [], trackedUserIds = [] } = config.config || {};

    if (trackedPostIds.length === 0 && trackedUserIds.length === 0) {
      throw new Error('No post IDs or user IDs to track for engagement spikes');
    }

    // Take initial snapshot
    await this.pollEngagement(
      trackerId,
      trackedPostIds,
      trackedUserIds,
      config.config?.thresholds,
    );

    const pollInterval =
      this.configService.get<number>('TRACKER_ENGAGEMENT_POLL_INTERVAL') ||
      DEFAULT_ENGAGEMENT_POLL_INTERVAL;

    const interval = setInterval(() => {
      this.pollEngagement(
        trackerId,
        trackedPostIds,
        trackedUserIds,
        config.config?.thresholds,
      ).catch((error) => {
        this.logger.error(
          `Engagement poll error for tracker ${trackerId}: ${error?.message || error}`,
        );
      });
    }, pollInterval);

    this.pollIntervals.set(trackerId, interval);
    await this.trackerConfigRepo.updateStatus(trackerId, TrackerStatus.ACTIVE);

    this.logger.log(
      `EngagementSpikeTracker started for ${trackedPostIds.length} posts + ${trackedUserIds.length} users, polling every ${pollInterval}ms (tracker: ${trackerId})`,
    );
  }

  async stop(trackerId: string): Promise<void> {
    const interval = this.pollIntervals.get(trackerId);
    if (interval) {
      clearInterval(interval);
      this.pollIntervals.delete(trackerId);
    }

    await this.trackerConfigRepo.updateStatus(trackerId, TrackerStatus.PAUSED);
    this.logger.log(`EngagementSpikeTracker stopped (tracker: ${trackerId})`);
  }

  private async pollEngagement(
    trackerId: string,
    postIds: string[],
    userIds: string[],
    thresholds?: {
      likesPerMinute?: number;
      retweetsPerMinute?: number;
      repliesPerMinute?: number;
    },
  ): Promise<void> {
    try {
      // Collect all post IDs to check
      const allPostIds = [...postIds];

      // If tracking users, get their recent posts
      if (userIds.length > 0) {
        for (const userId of userIds) {
          try {
            const userPosts = await this.xdkClient.readClient.users.getPosts(
              userId,
              {
                maxResults: 5,
                tweetFields: [
                  'id',
                  'public_metrics',
                  'author_id',
                  'created_at',
                ],
              },
            );
            const posts = userPosts?.data || [];
            for (const post of posts) {
              if (post.id && !allPostIds.includes(post.id)) {
                allPostIds.push(post.id);
              }
            }
          } catch (error) {
            this.logger.warn(
              `Failed to get posts for user ${userId}: ${error?.message || error}`,
            );
          }
        }
      }

      if (allPostIds.length === 0) return;

      // Fetch current metrics for all posts (batch up to 100)
      const batchSize = 100;
      for (let i = 0; i < allPostIds.length; i += batchSize) {
        const batch = allPostIds.slice(i, i + batchSize);

        const response = await this.xdkClient.readClient.posts.getByIds(batch, {
          tweetFields: ['id', 'public_metrics', 'author_id', 'created_at'],
        });

        const posts = response?.data || [];

        for (const post of posts) {
          const metrics =
            post.publicMetrics || (post as any).public_metrics || {};
          const currentLikes = metrics.like_count || metrics.likeCount || 0;
          const currentRetweets =
            metrics.retweet_count || metrics.retweetCount || 0;
          const currentReplies = metrics.reply_count || metrics.replyCount || 0;
          const currentViews =
            metrics.impression_count || metrics.impressionCount || 0;
          const currentBookmarks =
            metrics.bookmark_count || metrics.bookmarkCount || 0;

          // Get recent snapshots for this post
          const recentSnapshots =
            await this.engagementSnapshotRepo.findRecentByTweetId(
              post.id!,
              ENGAGEMENT_MIN_SNAPSHOTS_FOR_SPIKE + 1,
            );

          // Save new snapshot
          await this.engagementSnapshotRepo.create({
            tweetId: post.id!,
            authorId: post.authorId || (post as any).author_id || '',
            likes: currentLikes,
            retweets: currentRetweets,
            replies: currentReplies,
            views: currentViews,
            bookmarks: currentBookmarks,
            snapshotAt: new Date(),
          });

          // Detect spikes if we have enough history
          if (recentSnapshots.length >= ENGAGEMENT_MIN_SNAPSHOTS_FOR_SPIKE) {
            const previousSnapshot = recentSnapshots[0]; // most recent before current
            const timeDeltaMs =
              Date.now() - new Date(previousSnapshot.snapshotAt).getTime();
            const timeDeltaMinutes = timeDeltaMs / 60000;

            if (timeDeltaMinutes > 0) {
              const likesDelta = currentLikes - previousSnapshot.likes;
              const retweetsDelta = currentRetweets - previousSnapshot.retweets;
              const repliesDelta = currentReplies - previousSnapshot.replies;

              const likesPerMinute = likesDelta / timeDeltaMinutes;
              const retweetsPerMinute = retweetsDelta / timeDeltaMinutes;
              const repliesPerMinute = repliesDelta / timeDeltaMinutes;

              // Calculate average rates from history
              const avgLikesRate = this.calculateAverageRate(
                recentSnapshots,
                'likes',
              );
              const avgRetweetsRate = this.calculateAverageRate(
                recentSnapshots,
                'retweets',
              );
              const avgRepliesRate = this.calculateAverageRate(
                recentSnapshots,
                'replies',
              );

              const spikeMultiplier = ENGAGEMENT_SPIKE_MULTIPLIER;
              const isLikeSpike =
                likesPerMinute > avgLikesRate * spikeMultiplier ||
                (thresholds?.likesPerMinute &&
                  likesPerMinute >= thresholds.likesPerMinute);
              const isRetweetSpike =
                retweetsPerMinute > avgRetweetsRate * spikeMultiplier ||
                (thresholds?.retweetsPerMinute &&
                  retweetsPerMinute >= thresholds.retweetsPerMinute);
              const isReplySpike =
                repliesPerMinute > avgRepliesRate * spikeMultiplier ||
                (thresholds?.repliesPerMinute &&
                  repliesPerMinute >= thresholds.repliesPerMinute);

              if (isLikeSpike || isRetweetSpike || isReplySpike) {
                const spikeTypes: string[] = [];
                if (isLikeSpike) spikeTypes.push('likes');
                if (isRetweetSpike) spikeTypes.push('retweets');
                if (isReplySpike) spikeTypes.push('replies');

                const trackerEvent: TrackerEvent = {
                  trackerId,
                  trackerType: TrackerType.ENGAGEMENT_SPIKE,
                  eventType: 'engagement_spike',
                  data: {
                    tweetId: post.id,
                    authorId: post.authorId || (post as any).author_id,
                    spikeTypes,
                    currentMetrics: {
                      likes: currentLikes,
                      retweets: currentRetweets,
                      replies: currentReplies,
                      views: currentViews,
                    },
                    rates: {
                      likesPerMinute: +likesPerMinute.toFixed(2),
                      retweetsPerMinute: +retweetsPerMinute.toFixed(2),
                      repliesPerMinute: +repliesPerMinute.toFixed(2),
                    },
                    averageRates: {
                      likesPerMinute: +avgLikesRate.toFixed(2),
                      retweetsPerMinute: +avgRetweetsRate.toFixed(2),
                      repliesPerMinute: +avgRepliesRate.toFixed(2),
                    },
                  },
                  timestamp: new Date(),
                };
                this.eventEmitter.emit('tracker.event', trackerEvent);

                this.logger.log(
                  `Engagement spike detected on tweet ${post.id}: ${spikeTypes.join(', ')}`,
                );
              }
            }
          }
        }
      }

      await this.trackerConfigRepo.updateLastRunAt(trackerId);
    } catch (error) {
      this.logger.error(
        `Failed to poll engagement for tracker ${trackerId}: ${error?.message || error}`,
      );
      await this.trackerConfigRepo.updateStatus(
        trackerId,
        TrackerStatus.ERROR,
        error?.message || 'Engagement poll failed',
      );
    }
  }

  /**
   * Calculate average rate of change per minute for a metric across snapshots.
   */
  private calculateAverageRate(snapshots: any[], metric: string): number {
    if (snapshots.length < 2) return 0;

    let totalDelta = 0;
    let totalTimeMinutes = 0;

    for (let i = 0; i < snapshots.length - 1; i++) {
      const current = snapshots[i];
      const previous = snapshots[i + 1];
      const delta = (current[metric] || 0) - (previous[metric] || 0);
      const timeMs =
        new Date(current.snapshotAt).getTime() -
        new Date(previous.snapshotAt).getTime();
      const timeMinutes = timeMs / 60000;

      if (timeMinutes > 0) {
        totalDelta += delta;
        totalTimeMinutes += timeMinutes;
      }
    }

    return totalTimeMinutes > 0 ? totalDelta / totalTimeMinutes : 0;
  }
}
