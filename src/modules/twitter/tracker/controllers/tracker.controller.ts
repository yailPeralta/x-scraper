import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { TrackerConfigRepository } from '../repositories/tracker-config.repository';
import { TrackedTweetRepository } from '../repositories/tracked-tweet.repository';
import { ProfileChangeLogRepository } from '../repositories/profile-change-log.repository';
import { UserProfileSnapshotRepository } from '../repositories/user-profile-snapshot.repository';
import { CreateTrackerDto } from '../dto/create-tracker.dto';
import { UpdateTrackerDto } from '../dto/update-tracker.dto';
import { TrackerType, TrackerStatus } from '../interfaces/tracker-type.enum';

// Tracker services
import { UserTweetTrackerService } from '../services/trackers/user-tweet-tracker.service';
import { HashtagTweetTrackerService } from '../services/trackers/hashtag-tweet-tracker.service';
import { KeywordTweetTrackerService } from '../services/trackers/keyword-tweet-tracker.service';
import { CashtagMentionTrackerService } from '../services/trackers/cashtag-mention-tracker.service';
import { ProfileChangeTrackerService } from '../services/trackers/profile-change-tracker.service';
import { FollowerChangeTrackerService } from '../services/trackers/follower-change-tracker.service';
import { TrendTrackerService } from '../services/trackers/trend-tracker.service';
import { EngagementSpikeTrackerService } from '../services/trackers/engagement-spike-tracker.service';

@Controller('trackers')
export class TrackerController {
  private readonly logger = new Logger(TrackerController.name);

  constructor(
    private readonly trackerConfigRepo: TrackerConfigRepository,
    private readonly trackedTweetRepo: TrackedTweetRepository,
    private readonly profileChangeLogRepo: ProfileChangeLogRepository,
    private readonly profileSnapshotRepo: UserProfileSnapshotRepository,
    private readonly userTweetTracker: UserTweetTrackerService,
    private readonly hashtagTweetTracker: HashtagTweetTrackerService,
    private readonly keywordTweetTracker: KeywordTweetTrackerService,
    private readonly cashtagMentionTracker: CashtagMentionTrackerService,
    private readonly profileChangeTracker: ProfileChangeTrackerService,
    private readonly followerChangeTracker: FollowerChangeTrackerService,
    private readonly trendTracker: TrendTrackerService,
    private readonly engagementSpikeTracker: EngagementSpikeTrackerService,
  ) {}

  /**
   * GET /trackers — List all tracker configs
   */
  @Get()
  async listTrackers(
    @Query('skip') skip?: string,
    @Query('limit') limit?: string,
  ) {
    const trackers = await this.trackerConfigRepo.findAll({
      skip: skip ? parseInt(skip, 10) : 0,
      limit: limit ? parseInt(limit, 10) : 50,
    });
    const total = await this.trackerConfigRepo.count();
    return { data: trackers, total };
  }

  /**
   * POST /trackers — Create a new tracker
   */
  @Post()
  async createTracker(@Body() dto: CreateTrackerDto) {
    const tracker = await this.trackerConfigRepo.create({
      name: dto.name,
      type: dto.type,
      status: TrackerStatus.PAUSED,
      config: dto.config || {},
    });
    return { data: tracker };
  }

  /**
   * GET /trackers/:id — Get tracker by ID
   */
  @Get(':id')
  async getTracker(@Param('id') id: string) {
    const tracker = await this.trackerConfigRepo.findById(id);
    if (!tracker) {
      return { error: 'Tracker not found', statusCode: 404 };
    }
    return { data: tracker };
  }

  /**
   * PATCH /trackers/:id — Update tracker config
   */
  @Patch(':id')
  async updateTracker(@Param('id') id: string, @Body() dto: UpdateTrackerDto) {
    const updated = await this.trackerConfigRepo.update(id, {
      ...(dto.name && { name: dto.name }),
      ...(dto.config && { config: dto.config }),
    });
    if (!updated) {
      return { error: 'Tracker not found', statusCode: 404 };
    }
    return { data: updated };
  }

  /**
   * DELETE /trackers/:id — Delete tracker
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTracker(@Param('id') id: string) {
    // Stop tracker first if running
    try {
      await this.stopTrackerById(id);
    } catch {
      // Ignore errors when stopping
    }
    await this.trackerConfigRepo.delete(id);
  }

  /**
   * POST /trackers/:id/start — Start a tracker
   */
  @Post(':id/start')
  async startTracker(@Param('id') id: string) {
    const config = await this.trackerConfigRepo.findById(id);
    if (!config) {
      return { error: 'Tracker not found', statusCode: 404 };
    }

    try {
      await this.startTrackerById(id, config.type);
      return { data: { message: `Tracker ${config.name} started`, status: 'active' } };
    } catch (error) {
      await this.trackerConfigRepo.updateStatus(
        id,
        TrackerStatus.ERROR,
        error?.message || 'Failed to start',
      );
      return {
        error: `Failed to start tracker: ${error?.message || error}`,
        statusCode: 500,
      };
    }
  }

  /**
   * POST /trackers/:id/stop — Stop a tracker
   */
  @Post(':id/stop')
  async stopTracker(@Param('id') id: string) {
    const config = await this.trackerConfigRepo.findById(id);
    if (!config) {
      return { error: 'Tracker not found', statusCode: 404 };
    }

    try {
      await this.stopTrackerById(id);
      return { data: { message: `Tracker ${config.name} stopped`, status: 'paused' } };
    } catch (error) {
      return {
        error: `Failed to stop tracker: ${error?.message || error}`,
        statusCode: 500,
      };
    }
  }

  /**
   * GET /trackers/:id/events — Get historical events (tracked tweets) for a tracker
   */
  @Get(':id/events')
  async getTrackerEvents(
    @Param('id') id: string,
    @Query('skip') skip?: string,
    @Query('limit') limit?: string,
  ) {
    const tweets = await this.trackedTweetRepo.findByTrackerId(id, {
      skip: skip ? parseInt(skip, 10) : 0,
      limit: limit ? parseInt(limit, 10) : 20,
    });
    return { data: tweets };
  }

  /**
   * GET /trackers/profiles/:userId/history — Get profile change history
   */
  @Get('profiles/:userId/history')
  async getProfileHistory(
    @Param('userId') userId: string,
    @Query('skip') skip?: string,
    @Query('limit') limit?: string,
  ) {
    const changes = await this.profileChangeLogRepo.findByUserId(userId, {
      skip: skip ? parseInt(skip, 10) : 0,
      limit: limit ? parseInt(limit, 10) : 20,
    });
    return { data: changes };
  }

  /**
   * GET /trackers/profiles/:userId/snapshots — Get profile snapshots
   */
  @Get('profiles/:userId/snapshots')
  async getProfileSnapshots(
    @Param('userId') userId: string,
    @Query('skip') skip?: string,
    @Query('limit') limit?: string,
  ) {
    const snapshots = await this.profileSnapshotRepo.findByUserId(userId, {
      skip: skip ? parseInt(skip, 10) : 0,
      limit: limit ? parseInt(limit, 10) : 20,
    });
    return { data: snapshots };
  }

  /**
   * GET /trackers/cashtags/velocities — Get current cashtag mention velocities
   */
  @Get('cashtags/velocities')
  async getCashtagVelocities(@Query('window') window?: string) {
    const windowMinutes = window ? parseInt(window, 10) : 5;
    const velocities = this.cashtagMentionTracker.getAllVelocities(windowMinutes);
    return { data: velocities };
  }

  // --- Private helpers ---

  private async startTrackerById(id: string, type: TrackerType): Promise<void> {
    switch (type) {
      case TrackerType.USER_TWEET:
        return this.userTweetTracker.start(id);
      case TrackerType.HASHTAG_TWEET:
        return this.hashtagTweetTracker.start(id);
      case TrackerType.KEYWORD_TWEET:
        return this.keywordTweetTracker.start(id);
      case TrackerType.CASHTAG_MENTION:
        return this.cashtagMentionTracker.start(id);
      case TrackerType.PROFILE_CHANGE:
        return this.profileChangeTracker.start(id);
      case TrackerType.FOLLOWER_CHANGE:
        return this.followerChangeTracker.start(id);
      case TrackerType.TREND:
        return this.trendTracker.start(id);
      case TrackerType.ENGAGEMENT_SPIKE:
        return this.engagementSpikeTracker.start(id);
      default:
        throw new Error(`Unknown tracker type: ${type}`);
    }
  }

  private async stopTrackerById(id: string): Promise<void> {
    const config = await this.trackerConfigRepo.findById(id);
    if (!config) return;

    switch (config.type) {
      case TrackerType.USER_TWEET:
        return this.userTweetTracker.stop(id);
      case TrackerType.HASHTAG_TWEET:
        return this.hashtagTweetTracker.stop(id);
      case TrackerType.KEYWORD_TWEET:
        return this.keywordTweetTracker.stop(id);
      case TrackerType.CASHTAG_MENTION:
        return this.cashtagMentionTracker.stop(id);
      case TrackerType.PROFILE_CHANGE:
        return this.profileChangeTracker.stop(id);
      case TrackerType.FOLLOWER_CHANGE:
        return this.followerChangeTracker.stop(id);
      case TrackerType.TREND:
        return this.trendTracker.stop(id);
      case TrackerType.ENGAGEMENT_SPIKE:
        return this.engagementSpikeTracker.stop(id);
    }
  }
}
