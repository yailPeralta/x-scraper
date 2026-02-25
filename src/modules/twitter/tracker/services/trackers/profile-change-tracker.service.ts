import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { XdkClientService } from '../../../../../common/services/twitter/xdk-client.service';
import { UserProfileSnapshotRepository } from '../../repositories/user-profile-snapshot.repository';
import { ProfileChangeLogRepository } from '../../repositories/profile-change-log.repository';
import { TrackerConfigRepository } from '../../repositories/tracker-config.repository';
import {
  TrackerType,
  TrackerStatus,
} from '../../interfaces/tracker-type.enum';
import { TrackerEvent } from '../../interfaces/tracker-event.interface';
import { parseUserProfile } from '../../../../../common/utils/tweet-parser.util';
import { DEFAULT_PROFILE_POLL_INTERVAL } from '../../constants/tracker.constants';
import { EnvironmentVariables } from '../../../../../common/config/env.validation';

/** Fields to monitor for changes */
const PROFILE_FIELDS = [
  'displayName',
  'bio',
  'profileImageUrl',
  'profileBannerUrl',
  'location',
  'url',
  'verified',
  'verifiedType',
  'subscriptionType',
  'username',
];

@Injectable()
export class ProfileChangeTrackerService implements OnModuleDestroy {
  private readonly logger = new Logger(ProfileChangeTrackerService.name);
  private pollIntervals = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    private readonly xdkClient: XdkClientService,
    private readonly profileSnapshotRepo: UserProfileSnapshotRepository,
    private readonly profileChangeLogRepo: ProfileChangeLogRepository,
    private readonly trackerConfigRepo: TrackerConfigRepository,
    private readonly configService: ConfigService<EnvironmentVariables>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleDestroy(): void {
    // Clear all polling intervals
    for (const [trackerId, interval] of this.pollIntervals) {
      clearInterval(interval);
      this.logger.debug(`Cleared poll interval for tracker ${trackerId}`);
    }
    this.pollIntervals.clear();
  }

  /**
   * Start monitoring profile changes for tracked users via polling.
   * Takes an initial snapshot and then polls at configured intervals.
   */
  async start(trackerId: string): Promise<void> {
    const config = await this.trackerConfigRepo.findById(trackerId);
    if (!config) throw new Error(`Tracker config not found: ${trackerId}`);

    const { trackedUserIds = [], trackedFields } = config.config || {};

    if (trackedUserIds.length === 0) {
      throw new Error('No user IDs to track for profile changes');
    }

    // Take initial snapshot
    await this.pollProfiles(trackerId, trackedUserIds, trackedFields);

    // Set up polling interval
    const pollInterval =
      this.configService.get<number>('TRACKER_PROFILE_POLL_INTERVAL') ||
      DEFAULT_PROFILE_POLL_INTERVAL;

    const interval = setInterval(() => {
      this.pollProfiles(trackerId, trackedUserIds, trackedFields).catch(
        (error) => {
          this.logger.error(
            `Profile poll error for tracker ${trackerId}: ${error?.message || error}`,
          );
        },
      );
    }, pollInterval);

    this.pollIntervals.set(trackerId, interval);

    await this.trackerConfigRepo.updateStatus(trackerId, TrackerStatus.ACTIVE);

    this.logger.log(
      `ProfileChangeTracker started for ${trackedUserIds.length} users, polling every ${pollInterval}ms (tracker: ${trackerId})`,
    );
  }

  async stop(trackerId: string): Promise<void> {
    const interval = this.pollIntervals.get(trackerId);
    if (interval) {
      clearInterval(interval);
      this.pollIntervals.delete(trackerId);
    }

    await this.trackerConfigRepo.updateStatus(trackerId, TrackerStatus.PAUSED);
    this.logger.log(`ProfileChangeTracker stopped (tracker: ${trackerId})`);
  }

  /**
   * Get profile change history for a user.
   */
  async getChangeHistory(
    userId: string,
    options: { skip?: number; limit?: number } = {},
  ) {
    return this.profileChangeLogRepo.findByUserId(userId, options);
  }

  /**
   * Get profile snapshots for a user.
   */
  async getSnapshots(userId: string, options: { from?: Date; to?: Date } = {}) {
    if (options.from && options.to) {
      return this.profileSnapshotRepo.findByUserIdInRange(
        userId,
        options.from,
        options.to,
      );
    }
    return this.profileSnapshotRepo.findLatestByUserId(userId);
  }

  /**
   * Poll user profiles and detect changes.
   */
  private async pollProfiles(
    trackerId: string,
    userIds: string[],
    trackedFields?: string[],
  ): Promise<void> {
    try {
      // Fetch current profiles from X API (batch up to 100)
      const response = await this.xdkClient.readClient.users.getByIds(userIds, {
        userFields: [
          'id',
          'name',
          'username',
          'description',
          'profile_image_url',
          'profile_banner_url',
          'location',
          'url',
          'verified',
          'verified_type',
          'subscription_type',
          'public_metrics',
        ],
      });

      const users = response?.data || [];

      for (const user of users) {
        const profile = parseUserProfile(user);
        if (!profile) continue;

        // Get the latest snapshot for this user
        const latestSnapshot =
          await this.profileSnapshotRepo.findLatestByUserId(profile.userId);

        // Save new snapshot
        await this.profileSnapshotRepo.create({
          ...profile,
          snapshotAt: new Date(),
        });

        // Compare with previous snapshot to detect changes
        if (latestSnapshot) {
          const fieldsToCheck = trackedFields || PROFILE_FIELDS;
          const changes: Array<{
            field: string;
            oldValue: string;
            newValue: string;
          }> = [];

          for (const field of fieldsToCheck) {
            const oldVal = String((latestSnapshot as any)[field] ?? '');
            const newVal = String(profile[field] ?? '');

            if (oldVal !== newVal) {
              changes.push({
                field,
                oldValue: oldVal,
                newValue: newVal,
              });
            }
          }

          if (changes.length > 0) {
            // Log all changes
            const changeLogs = changes.map((change) => ({
              userId: profile.userId,
              username: profile.username,
              field: change.field,
              oldValue: change.oldValue,
              newValue: change.newValue,
              detectedAt: new Date(),
              source: 'polling' as const,
            }));

            await this.profileChangeLogRepo.createMany(changeLogs);

            // Emit event for each change
            for (const change of changes) {
              const trackerEvent: TrackerEvent = {
                trackerId,
                trackerType: TrackerType.PROFILE_CHANGE,
                eventType: 'profile_change',
                data: {
                  userId: profile.userId,
                  username: profile.username,
                  field: change.field,
                  oldValue: change.oldValue,
                  newValue: change.newValue,
                },
                timestamp: new Date(),
              };
              this.eventEmitter.emit('tracker.event', trackerEvent);
            }

            this.logger.log(
              `Detected ${changes.length} profile change(s) for @${profile.username}: ${changes.map((c) => c.field).join(', ')}`,
            );
          }
        }
      }

      await this.trackerConfigRepo.updateLastRunAt(trackerId);
    } catch (error) {
      this.logger.error(
        `Failed to poll profiles for tracker ${trackerId}: ${error?.message || error}`,
      );
      await this.trackerConfigRepo.updateStatus(
        trackerId,
        TrackerStatus.ERROR,
        error?.message || 'Profile poll failed',
      );
    }
  }
}
