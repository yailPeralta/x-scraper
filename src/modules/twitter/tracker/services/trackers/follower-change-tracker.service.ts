import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { XdkClientService } from '../../../../../common/services/twitter/xdk-client.service';
import { FollowerSnapshotRepository } from '../../repositories/follower-snapshot.repository';
import { TrackerConfigRepository } from '../../repositories/tracker-config.repository';
import {
  TrackerType,
  TrackerStatus,
} from '../../interfaces/tracker-type.enum';
import { TrackerEvent } from '../../interfaces/tracker-event.interface';
import { DEFAULT_FOLLOWER_POLL_INTERVAL } from '../../constants/tracker.constants';
import { EnvironmentVariables } from '../../../../../common/config/env.validation';

@Injectable()
export class FollowerChangeTrackerService implements OnModuleDestroy {
  private readonly logger = new Logger(FollowerChangeTrackerService.name);
  private pollIntervals = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    private readonly xdkClient: XdkClientService,
    private readonly followerSnapshotRepo: FollowerSnapshotRepository,
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

    const { trackedUserIds = [] } = config.config || {};

    if (trackedUserIds.length === 0) {
      throw new Error('No user IDs to track for follower changes');
    }

    // Take initial snapshot
    await this.pollFollowers(trackerId, trackedUserIds);

    const pollInterval =
      this.configService.get<number>('TRACKER_FOLLOWER_POLL_INTERVAL') ||
      DEFAULT_FOLLOWER_POLL_INTERVAL;

    const interval = setInterval(() => {
      this.pollFollowers(trackerId, trackedUserIds).catch((error) => {
        this.logger.error(
          `Follower poll error for tracker ${trackerId}: ${error?.message || error}`,
        );
      });
    }, pollInterval);

    this.pollIntervals.set(trackerId, interval);
    await this.trackerConfigRepo.updateStatus(trackerId, TrackerStatus.ACTIVE);

    this.logger.log(
      `FollowerChangeTracker started for ${trackedUserIds.length} users, polling every ${pollInterval}ms (tracker: ${trackerId})`,
    );
  }

  async stop(trackerId: string): Promise<void> {
    const interval = this.pollIntervals.get(trackerId);
    if (interval) {
      clearInterval(interval);
      this.pollIntervals.delete(trackerId);
    }

    await this.trackerConfigRepo.updateStatus(trackerId, TrackerStatus.PAUSED);
    this.logger.log(`FollowerChangeTracker stopped (tracker: ${trackerId})`);
  }

  private async pollFollowers(
    trackerId: string,
    userIds: string[],
  ): Promise<void> {
    try {
      const response = await this.xdkClient.readClient.users.getByIds(userIds, {
        userFields: ['id', 'username', 'public_metrics'],
      });

      const users = response?.data || [];

      for (const user of users) {
        const publicMetrics =
          user.publicMetrics || (user as any).public_metrics || {};
        const currentFollowers =
          publicMetrics.followers_count || publicMetrics.followersCount || 0;
        const currentFollowing =
          publicMetrics.following_count || publicMetrics.followingCount || 0;

        // Get previous snapshot
        const previousSnapshot =
          await this.followerSnapshotRepo.findLatestByUserId(user.id);

        // Save new snapshot
        await this.followerSnapshotRepo.create({
          userId: user.id,
          username: user.username,
          followersCount: currentFollowers,
          followingCount: currentFollowing,
          snapshotAt: new Date(),
        });

        // Detect changes
        if (previousSnapshot) {
          const followerDelta =
            currentFollowers - previousSnapshot.followersCount;
          const followingDelta =
            currentFollowing - previousSnapshot.followingCount;

          if (followerDelta !== 0) {
            const trackerEvent: TrackerEvent = {
              trackerId,
              trackerType: TrackerType.FOLLOWER_CHANGE,
              eventType:
                followerDelta > 0
                  ? 'followers_increased'
                  : 'followers_decreased',
              data: {
                userId: user.id,
                username: user.username,
                previousCount: previousSnapshot.followersCount,
                currentCount: currentFollowers,
                delta: followerDelta,
                deltaPercent:
                  previousSnapshot.followersCount > 0
                    ? (
                        (followerDelta / previousSnapshot.followersCount) *
                        100
                      ).toFixed(2)
                    : '0',
              },
              timestamp: new Date(),
            };
            this.eventEmitter.emit('tracker.event', trackerEvent);

            this.logger.log(
              `@${user.username} followers ${followerDelta > 0 ? '+' : ''}${followerDelta} (${previousSnapshot.followersCount} → ${currentFollowers})`,
            );
          }

          if (followingDelta !== 0) {
            const trackerEvent: TrackerEvent = {
              trackerId,
              trackerType: TrackerType.FOLLOWER_CHANGE,
              eventType:
                followingDelta > 0
                  ? 'following_increased'
                  : 'following_decreased',
              data: {
                userId: user.id,
                username: user.username,
                previousCount: previousSnapshot.followingCount,
                currentCount: currentFollowing,
                delta: followingDelta,
              },
              timestamp: new Date(),
            };
            this.eventEmitter.emit('tracker.event', trackerEvent);
          }
        }
      }

      await this.trackerConfigRepo.updateLastRunAt(trackerId);
    } catch (error) {
      this.logger.error(
        `Failed to poll followers for tracker ${trackerId}: ${error?.message || error}`,
      );
      await this.trackerConfigRepo.updateStatus(
        trackerId,
        TrackerStatus.ERROR,
        error?.message || 'Follower poll failed',
      );
    }
  }
}
