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

@Injectable()
export class HashtagTweetTrackerService {
  private readonly logger = new Logger(HashtagTweetTrackerService.name);

  constructor(
    private readonly streamManager: StreamManagerService,
    private readonly trackedTweetRepo: TrackedTweetRepository,
    private readonly trackerConfigRepo: TrackerConfigRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Start tracking tweets containing specific hashtags.
   * Creates filtered stream rules like "#bitcoin OR #ethereum".
   */
  async start(trackerId: string): Promise<void> {
    const config = await this.trackerConfigRepo.findById(trackerId);
    if (!config) throw new Error(`Tracker config not found: ${trackerId}`);

    const { hashtags = [] } = config.config || {};

    if (hashtags.length === 0) {
      throw new Error('No hashtags to track');
    }

    // Build stream rule: "#hashtag1 OR #hashtag2 ..."
    const ruleTag = `hashtag_tweet_${trackerId}`;
    const ruleValue = hashtags
      .map((h: string) => (h.startsWith('#') ? h : `#${h}`))
      .join(' OR ');

    const createdRules = await this.streamManager.addRules([
      { value: ruleValue, tag: ruleTag },
    ]);

    const ruleIds = createdRules.map((r) => r.id);
    await this.trackerConfigRepo.update(trackerId, {
      streamRuleIds: ruleIds,
      status: TrackerStatus.ACTIVE,
    });

    this.streamManager.onTweet(ruleTag, (event: any) => {
      this.handleTweet(trackerId, ruleTag, event);
    });

    if (!this.streamManager.isStreamConnected()) {
      await this.streamManager.connect();
    }

    this.logger.log(
      `HashtagTweetTracker started for ${hashtags.length} hashtags (tracker: ${trackerId})`,
    );
  }

  async stop(trackerId: string): Promise<void> {
    const config = await this.trackerConfigRepo.findById(trackerId);
    if (!config) return;

    const ruleTag = `hashtag_tweet_${trackerId}`;

    if (config.streamRuleIds?.length > 0) {
      await this.streamManager.removeRules(config.streamRuleIds);
    }

    this.streamManager.offTweet(ruleTag);
    await this.trackerConfigRepo.updateStatus(trackerId, TrackerStatus.PAUSED);

    this.logger.log(`HashtagTweetTracker stopped (tracker: ${trackerId})`);
  }

  private async handleTweet(
    trackerId: string,
    ruleTag: string,
    event: any,
  ): Promise<void> {
    try {
      const tweetData = parseTweetFromStreamEvent(event);
      if (!tweetData) return;

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

      const trackerEvent: TrackerEvent = {
        trackerId,
        trackerType: TrackerType.HASHTAG_TWEET,
        eventType: 'new_tweet',
        data: tweetData,
        timestamp: new Date(),
      };
      this.eventEmitter.emit('tracker.event', trackerEvent);
    } catch (error) {
      this.logger.error(
        `Error handling tweet for tracker ${trackerId}: ${error?.message || error}`,
      );
    }
  }
}
