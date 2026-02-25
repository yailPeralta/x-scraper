import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StreamManagerService } from 'src/common/services/twitter/stream-manager.service';
import { XdkClientService } from 'src/common/services/twitter/xdk-client.service';
import { TrackedTweetRepository } from '../../repositories/tracked-tweet.repository';
import { TrackerConfigRepository } from '../../repositories/tracker-config.repository';
import { TrackerType, TrackerStatus } from '../../interfaces/tracker-type.enum';
import { TrackerEvent } from '../../interfaces/tracker-event.interface';
import { parseTweetFromStreamEvent } from 'src/common/utils/tweet-parser.util';

@Injectable()
export class UserTweetTrackerService {
  private readonly logger = new Logger(UserTweetTrackerService.name);

  constructor(
    private readonly streamManager: StreamManagerService,
    private readonly xdkClient: XdkClientService,
    private readonly trackedTweetRepo: TrackedTweetRepository,
    private readonly trackerConfigRepo: TrackerConfigRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Start tracking tweets from a list of users.
   * Resolves usernames to user IDs, creates filtered stream rules, and registers callbacks.
   */
  async start(trackerId: string): Promise<void> {
    const config = await this.trackerConfigRepo.findById(trackerId);
    if (!config) throw new Error(`Tracker config not found: ${trackerId}`);

    const { usernames = [], userIds = [] } = config.config || {};

    // Resolve usernames to user IDs if needed
    const resolvedIds = [...userIds];
    if (usernames.length > 0) {
      try {
        const response = await this.xdkClient.readClient.users.getByUsernames(
          usernames,
          { userFields: ['id', 'username'] },
        );
        const users = response?.data || [];
        for (const user of users) {
          if (user.id && !resolvedIds.includes(user.id)) {
            resolvedIds.push(user.id);
          }
        }
      } catch (error) {
        this.logger.error(`Failed to resolve usernames: ${error?.message || error}`);
      }
    }

    if (resolvedIds.length === 0) {
      throw new Error('No valid user IDs to track');
    }

    // Build stream rule: "from:userId1 OR from:userId2 ..."
    const ruleTag = `user_tweet_${trackerId}`;
    const ruleValue = resolvedIds.map((id) => `from:${id}`).join(' OR ');

    // Add rule to stream
    const createdRules = await this.streamManager.addRules([
      { value: ruleValue, tag: ruleTag },
    ]);

    // Store rule IDs in tracker config
    const ruleIds = createdRules.map((r) => r.id);
    await this.trackerConfigRepo.update(trackerId, {
      streamRuleIds: ruleIds,
      status: TrackerStatus.ACTIVE,
    });

    // Register callback for this tag
    this.streamManager.onTweet(ruleTag, (event: any) => {
      this.handleTweet(trackerId, ruleTag, event);
    });

    // Ensure stream is connected
    if (!this.streamManager.isStreamConnected()) {
      await this.streamManager.connect();
    }

    this.logger.log(
      `UserTweetTracker started for ${resolvedIds.length} users (tracker: ${trackerId})`,
    );
  }

  /**
   * Stop tracking tweets for this tracker.
   */
  async stop(trackerId: string): Promise<void> {
    const config = await this.trackerConfigRepo.findById(trackerId);
    if (!config) return;

    const ruleTag = `user_tweet_${trackerId}`;

    // Remove stream rules
    if (config.streamRuleIds?.length > 0) {
      await this.streamManager.removeRules(config.streamRuleIds);
    }

    // Unregister callback
    this.streamManager.offTweet(ruleTag);

    // Update status
    await this.trackerConfigRepo.updateStatus(trackerId, TrackerStatus.PAUSED);

    this.logger.log(`UserTweetTracker stopped (tracker: ${trackerId})`);
  }

  /**
   * Handle an incoming tweet from the stream.
   */
  private async handleTweet(
    trackerId: string,
    ruleTag: string,
    event: any,
  ): Promise<void> {
    try {
      const tweetData = parseTweetFromStreamEvent(event);
      if (!tweetData) return;

      // Save to DB
      const existing = await this.trackedTweetRepo.findByTweetId(tweetData.tweetId as string);
      if (existing) {
        // Add this tracker to the matched list if not already there
        if (!existing.matchedTrackerIds?.includes(trackerId)) {
          await this.trackedTweetRepo.bulkUpsert([
            {
              ...tweetData,
              matchedTrackerIds: [...(existing.matchedTrackerIds || []), trackerId],
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

      // Update last run
      await this.trackerConfigRepo.updateLastRunAt(trackerId);

      // Emit event
      const trackerEvent: TrackerEvent = {
        trackerId,
        trackerType: TrackerType.USER_TWEET,
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
