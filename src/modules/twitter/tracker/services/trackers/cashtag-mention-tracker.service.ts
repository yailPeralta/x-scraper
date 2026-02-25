import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StreamManagerService } from 'src/common/services/twitter/stream-manager.service';
import { TrackedTweetRepository } from '../../repositories/tracked-tweet.repository';
import { TrackerConfigRepository } from '../../repositories/tracker-config.repository';
import {
  TrackerType,
  TrackerStatus,
} from '../../interfaces/tracker-type.enum';
import { TrackerEvent } from '../../interfaces/tracker-event.interface';
import { parseTweetFromStreamEvent } from 'src/common/utils/tweet-parser.util';

/**
 * Tracks $CASHTAG mentions in real-time for memecoin traders.
 * Provides mention velocity tracking and volume alerts.
 */
@Injectable()
export class CashtagMentionTrackerService {
  private readonly logger = new Logger(CashtagMentionTrackerService.name);

  /** In-memory mention counters for velocity calculation: cashtag -> timestamps[] */
  private mentionTimestamps = new Map<string, number[]>();

  constructor(
    private readonly streamManager: StreamManagerService,
    private readonly trackedTweetRepo: TrackedTweetRepository,
    private readonly trackerConfigRepo: TrackerConfigRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Start tracking $CASHTAG mentions.
   * Creates filtered stream rules like "$BTC OR $ETH OR $PEPE".
   */
  async start(trackerId: string): Promise<void> {
    const config = await this.trackerConfigRepo.findById(trackerId);
    if (!config) throw new Error(`Tracker config not found: ${trackerId}`);

    const { cashtags = [] } = config.config || {};

    if (cashtags.length === 0) {
      throw new Error('No cashtags to track');
    }

    // Build stream rule: "$BTC OR $ETH ..."
    const ruleTag = `cashtag_mention_${trackerId}`;
    const ruleValue = cashtags
      .map((c: string) => (c.startsWith('$') ? c : `$${c}`))
      .join(' OR ');

    const createdRules = await this.streamManager.addRules([
      { value: ruleValue, tag: ruleTag },
    ]);

    const ruleIds = createdRules.map((r) => r.id);
    await this.trackerConfigRepo.update(trackerId, {
      streamRuleIds: ruleIds,
      status: TrackerStatus.ACTIVE,
    });

    // Initialize mention counters
    for (const cashtag of cashtags) {
      const normalized = cashtag.startsWith('$') ? cashtag : `$${cashtag}`;
      this.mentionTimestamps.set(normalized.toUpperCase(), []);
    }

    this.streamManager.onTweet(ruleTag, (event: any) => {
      this.handleTweet(trackerId, ruleTag, event, cashtags);
    });

    if (!this.streamManager.isStreamConnected()) {
      await this.streamManager.connect();
    }

    this.logger.log(
      `CashtagMentionTracker started for ${cashtags.length} cashtags (tracker: ${trackerId})`,
    );
  }

  async stop(trackerId: string): Promise<void> {
    const config = await this.trackerConfigRepo.findById(trackerId);
    if (!config) return;

    const ruleTag = `cashtag_mention_${trackerId}`;

    if (config.streamRuleIds?.length > 0) {
      await this.streamManager.removeRules(config.streamRuleIds);
    }

    this.streamManager.offTweet(ruleTag);
    this.mentionTimestamps.clear();
    await this.trackerConfigRepo.updateStatus(trackerId, TrackerStatus.PAUSED);

    this.logger.log(`CashtagMentionTracker stopped (tracker: ${trackerId})`);
  }

  /**
   * Get the mention velocity (mentions per minute) for a specific cashtag.
   * Looks at the last N minutes of data.
   */
  getMentionVelocity(cashtag: string, windowMinutes = 5): number {
    const key = cashtag.toUpperCase();
    const timestamps = this.mentionTimestamps.get(key) || [];
    const cutoff = Date.now() - windowMinutes * 60 * 1000;
    const recentMentions = timestamps.filter((t) => t >= cutoff);
    return recentMentions.length / windowMinutes;
  }

  /**
   * Get all tracked cashtag velocities.
   */
  getAllVelocities(windowMinutes = 5): Record<string, number> {
    const velocities: Record<string, number> = {};
    for (const [cashtag] of this.mentionTimestamps) {
      velocities[cashtag] = this.getMentionVelocity(cashtag, windowMinutes);
    }
    return velocities;
  }

  private async handleTweet(
    trackerId: string,
    ruleTag: string,
    event: any,
    trackedCashtags: string[],
  ): Promise<void> {
    try {
      const tweetData = parseTweetFromStreamEvent(event);
      if (!tweetData) return;

      // Update mention velocity counters
      const now = Date.now();
      const tweetCashtags = tweetData.cashtags || [];
      for (const tag of tweetCashtags) {
        const normalized = `$${tag}`.toUpperCase();
        const timestamps = this.mentionTimestamps.get(normalized);
        if (timestamps) {
          timestamps.push(now);
          // Keep only last 30 minutes of data
          const cutoff = now - 30 * 60 * 1000;
          const filtered = timestamps.filter((t) => t >= cutoff);
          this.mentionTimestamps.set(normalized, filtered);
        }
      }

      // Save to DB
      const existing = await this.trackedTweetRepo.findByTweetId(
        tweetData.tweetId!,
      );
      if (existing) {
        if (!existing.matchedTrackerIds?.includes(trackerId)) {
          await this.trackedTweetRepo.bulkUpsert([
            {
              ...tweetData,
              matchedTrackerIds: [
                ...(existing.matchedTrackerIds || []),
                trackerId,
              ],
              matchedRuleTags: [...(existing.matchedRuleTags || []), ruleTag],
            },
          ]);
        }
      } else {
        await this.trackedTweetRepo.create({
          ...tweetData,
          matchedTrackerIds: [trackerId],
          matchedRuleTags: [ruleTag],
        });
      }

      await this.trackerConfigRepo.updateLastRunAt(trackerId);

      // Emit event with velocity data
      const velocities = this.getAllVelocities();
      const trackerEvent: TrackerEvent = {
        trackerId,
        trackerType: TrackerType.CASHTAG_MENTION,
        eventType: 'new_tweet',
        data: {
          tweet: tweetData,
          velocities,
          matchedCashtags: tweetCashtags.filter((t: string) =>
            trackedCashtags.some(
              (ct) => ct.toUpperCase().replace('$', '') === t.toUpperCase(),
            ),
          ),
        },
        timestamp: new Date(),
      };
      this.eventEmitter.emit('tracker.event', trackerEvent);

      // Check for volume spike alerts
      for (const tag of tweetCashtags) {
        const normalized = `$${tag}`.toUpperCase();
        const velocity = this.getMentionVelocity(normalized, 1); // per minute
        const config = await this.trackerConfigRepo.findById(trackerId);
        const threshold = config?.config?.velocityAlertThreshold || 10;

        if (velocity >= threshold) {
          const spikeEvent: TrackerEvent = {
            trackerId,
            trackerType: TrackerType.CASHTAG_MENTION,
            eventType: 'velocity_spike',
            data: {
              cashtag: normalized,
              velocity,
              threshold,
            },
            timestamp: new Date(),
          };
          this.eventEmitter.emit('tracker.event', spikeEvent);
        }
      }
    } catch (error) {
      this.logger.error(
        `Error handling tweet for tracker ${trackerId}: ${error?.message || error}`,
      );
    }
  }
}
