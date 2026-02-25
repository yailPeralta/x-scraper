import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

// Schemas
import {
  TrackerConfig,
  TrackerConfigSchema,
} from 'src/common/database/mongodb/schemas/twitter/tracker-config.schema';
import {
  TrackedTweet,
  TrackedTweetSchema,
} from 'src/common/database/mongodb/schemas/twitter/tracked-tweet.schema';
import {
  UserProfileSnapshot,
  UserProfileSnapshotSchema,
} from 'src/common/database/mongodb/schemas/twitter/user-profile-snapshot.schema';
import {
  ProfileChangeLog,
  ProfileChangeLogSchema,
} from 'src/common/database/mongodb/schemas/twitter/profile-change-log.schema';
import {
  FollowerSnapshot,
  FollowerSnapshotSchema,
} from 'src/common/database/mongodb/schemas/twitter/follower-snapshot.schema';
import {
  TrendSnapshot,
  TrendSnapshotSchema,
} from 'src/common/database/mongodb/schemas/twitter/trend-snapshot.schema';
import {
  EngagementSnapshot,
  EngagementSnapshotSchema,
} from 'src/common/database/mongodb/schemas/twitter/engagement-snapshot.schema';

// Core Services
import { XdkClientService } from 'src/common/services/twitter/xdk-client.service';
import { StreamManagerService } from 'src/common/services/twitter/stream-manager.service';

// Tracker Services
import { UserTweetTrackerService } from './services/trackers/user-tweet-tracker.service';
import { HashtagTweetTrackerService } from './services/trackers/hashtag-tweet-tracker.service';
import { KeywordTweetTrackerService } from './services/trackers/keyword-tweet-tracker.service';
import { CashtagMentionTrackerService } from './services/trackers/cashtag-mention-tracker.service';
import { ProfileChangeTrackerService } from './services/trackers/profile-change-tracker.service';
import { FollowerChangeTrackerService } from './services/trackers/follower-change-tracker.service';
import { TrendTrackerService } from './services/trackers/trend-tracker.service';
import { EngagementSpikeTrackerService } from './services/trackers/engagement-spike-tracker.service';

// Repositories
import { TrackerConfigRepository } from './repositories/tracker-config.repository';
import { TrackedTweetRepository } from './repositories/tracked-tweet.repository';
import { UserProfileSnapshotRepository } from './repositories/user-profile-snapshot.repository';
import { ProfileChangeLogRepository } from './repositories/profile-change-log.repository';
import { FollowerSnapshotRepository } from './repositories/follower-snapshot.repository';
import { TrendSnapshotRepository } from './repositories/trend-snapshot.repository';
import { EngagementSnapshotRepository } from './repositories/engagement-snapshot.repository';

// Controllers
import { TrackerController } from './controllers/tracker.controller';

// Gateways
import { TrackerEventsGateway } from './gateways/tracker-events.gateway';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TrackerConfig.name, schema: TrackerConfigSchema },
      { name: TrackedTweet.name, schema: TrackedTweetSchema },
      { name: UserProfileSnapshot.name, schema: UserProfileSnapshotSchema },
      { name: ProfileChangeLog.name, schema: ProfileChangeLogSchema },
      { name: FollowerSnapshot.name, schema: FollowerSnapshotSchema },
      { name: TrendSnapshot.name, schema: TrendSnapshotSchema },
      { name: EngagementSnapshot.name, schema: EngagementSnapshotSchema },
    ]),
  ],
  controllers: [TrackerController, TrackerEventsGateway],
  providers: [
    // Core Services
    XdkClientService,
    StreamManagerService,

    // Tracker Services
    UserTweetTrackerService,
    HashtagTweetTrackerService,
    KeywordTweetTrackerService,
    CashtagMentionTrackerService,
    ProfileChangeTrackerService,
    FollowerChangeTrackerService,
    TrendTrackerService,
    EngagementSpikeTrackerService,

    // Repositories
    TrackerConfigRepository,
    TrackedTweetRepository,
    UserProfileSnapshotRepository,
    ProfileChangeLogRepository,
    FollowerSnapshotRepository,
    TrendSnapshotRepository,
    EngagementSnapshotRepository,
  ],
  exports: [
    XdkClientService,
    StreamManagerService,
    TrackerConfigRepository,
    TrackedTweetRepository,
    UserProfileSnapshotRepository,
    ProfileChangeLogRepository,
    FollowerSnapshotRepository,
    TrendSnapshotRepository,
    EngagementSnapshotRepository,
  ],
})
export class TwitterTrackerModule {}
