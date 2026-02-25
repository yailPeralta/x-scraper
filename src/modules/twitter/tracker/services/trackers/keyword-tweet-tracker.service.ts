import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StreamManagerService } from 'src/common/services/twitter//stream-manager.service';
import { TrackedTweetRepository } from '../../repositories/tracked-tweet.repository';
import { TrackerConfigRepository } from '../../repositories/tracker-config.repository';
import {
  TrackerType,
  TrackerStatus,
} from '../../interfaces/tracker-type.enum';
import { TrackerEvent } from '../../interfaces/tracker-event.interface';
import { parseTweetFromStreamEvent } from 'src/common/utils/tweet-parser.util';

@Injectable()
export class KeywordTweetTrackerService {
  private readonly logger = new Logger(KeywordTweetTrackerService.name);

  constructor(
    private readonly streamManager: StreamManagerService,
    private readonly trackedTweetRepo: TrackedTweetRepository,
    private readonly trackerConfigRepo: TrackerConfigRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Start tracking tweets containing specific keywords.
   * Creates filtered stream rules like "keyword1 OR keyword2".
   */
  async start(trackerId: string): Promise<void> {
    const config = await this.trackerConfigRepo.findById(trackerId);
    if (!config) throw new Error(`Tracker config not found: ${trackerId}`);

    const { keywords = [] } = config.config || {};

    if (keywords.length === 0) {
      throw new Error('No keywords to track');
    }

    // Build stream rule: "keyword1 OR keyword2 ..."
    // Wrap multi-word keywords in quotes
    const ruleTag = `keyword_tweet_${trackerId}`;
    const ruleValue = keywords
      .map((k: string) => (k.includes(' ') ? `"${k}"` : k))
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
      `KeywordTweetTracker started for ${keywords.length} keywords (tracker: ${trackerId})`,
    );
  }

  async stop(trackerId: string): Promise<void> {
    const config = await this.trackerConfigRepo.findById(trackerId);
    if (!config) return;

    const ruleTag = `keyword_tweet_${trackerId}`;

    if (config.streamRuleIds?.length > 0) {
      await this.streamManager.removeRules(config.streamRuleIds);
    }

    this.streamManager.offTweet(ruleTag);
    await this.trackerConfigRepo.updateStatus(trackerId, TrackerStatus.PAUSED);

    this.logger.log(`KeywordTweetTracker stopped (tracker: ${trackerId})`);
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
        trackerType: TrackerType.KEYWORD_TWEET,
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
