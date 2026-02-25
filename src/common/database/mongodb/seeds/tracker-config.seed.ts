/**
 * Seed data for TrackerConfig collection.
 *
 * Run with: npx ts-node -r tsconfig-paths/register src/common/database/mongodb/seeds/tracker-config.seed.ts
 *
 * Or import the `seedTrackerConfigs` function and call it from your bootstrap logic.
 */
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

/** ── Tracker type & status enums (mirrored to avoid import issues in standalone script) ── */
const TrackerType = {
  USER_TWEET: 'user_tweet',
  HASHTAG_TWEET: 'hashtag_tweet',
  KEYWORD_TWEET: 'keyword_tweet',
  PROFILE_CHANGE: 'profile_change',
  FOLLOWER_CHANGE: 'follower_change',
  CASHTAG_MENTION: 'cashtag_mention',
  TREND: 'trend',
  ENGAGEMENT_SPIKE: 'engagement_spike',
} as const;

const TrackerStatus = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  ERROR: 'error',
} as const;

/** ── Seed documents ── */
export const trackerConfigSeeds = [
  // ─── 1. User Tweet Tracker: Crypto Influencers ───
  {
    name: 'Crypto Influencers',
    type: TrackerType.USER_TWEET,
    status: TrackerStatus.ACTIVE,
    config: {
      usernames: [
        'elonmusk',
        'VitalikButerin',
        'caborek',
        'CryptoCapo_',
        'inversebrah',
        'GCRClassic',
      ],
      userIds: [],
    },
    streamRuleIds: [],
  },

  // ─── 2. Hashtag Tweet Tracker: Memecoin Hashtags ───
  {
    name: 'Memecoin Hashtags',
    type: TrackerType.HASHTAG_TWEET,
    status: TrackerStatus.ACTIVE,
    config: {
      hashtags: [
        '#memecoin',
        '#memecoins',
        '#solana',
        '#pumpfun',
        '#degen',
        '#100x',
        '#gem',
      ],
    },
    streamRuleIds: [],
  },

  // ─── 3. Keyword Tweet Tracker: Crypto Keywords ───
  {
    name: 'Crypto Alpha Keywords',
    type: TrackerType.KEYWORD_TWEET,
    status: TrackerStatus.ACTIVE,
    config: {
      keywords: [
        'just launched',
        'stealth launch',
        'new token',
        'presale live',
        'airdrop confirmed',
        'liquidity locked',
        'contract renounced',
      ],
    },
    streamRuleIds: [],
  },

  // ─── 4. Cashtag Mention Tracker: Top Memecoins ───
  {
    name: 'Top Memecoin Cashtags',
    type: TrackerType.CASHTAG_MENTION,
    status: TrackerStatus.ACTIVE,
    config: {
      cashtags: [
        '$BTC',
        '$ETH',
        '$SOL',
        '$DOGE',
        '$PEPE',
        '$WIF',
        '$BONK',
        '$SHIB',
        '$FLOKI',
        '$TRUMP',
      ],
      velocityAlertThreshold: 15, // mentions per minute to trigger alert
    },
    streamRuleIds: [],
  },

  // ─── 5. Profile Change Tracker: Key Accounts ───
  {
    name: 'Key Account Profile Monitor',
    type: TrackerType.PROFILE_CHANGE,
    status: TrackerStatus.ACTIVE,
    config: {
      trackedUserIds: [
        '44196397', // @elonmusk
        '5943622', // @pmarca
      ],
      trackedFields: [
        'displayName',
        'bio',
        'profileImageUrl',
        'profileBannerUrl',
        'username',
        'location',
        'url',
      ],
    },
  },

  // ─── 6. Follower Change Tracker: Whale Accounts ───
  {
    name: 'Whale Account Follower Monitor',
    type: TrackerType.FOLLOWER_CHANGE,
    status: TrackerStatus.ACTIVE,
    config: {
      trackedUserIds: [
        '44196397', // @elonmusk
        '5943622', // @pmarca
      ],
    },
  },

  // ─── 7. Trend Tracker: Worldwide Crypto Trends ───
  {
    name: 'Worldwide Crypto Trends',
    type: TrackerType.TREND,
    status: TrackerStatus.ACTIVE,
    config: {
      woeid: 1, // 1 = Worldwide
      filterKeywords: [
        'crypto',
        'bitcoin',
        'ethereum',
        'solana',
        'memecoin',
        'token',
        'nft',
        'defi',
        'web3',
        'airdrop',
        'launch',
        'ico'
      ],
    },
  },

  // ─── 8. Engagement Spike Tracker: Viral Crypto Posts ───
  {
    name: 'Viral Crypto Post Detector',
    type: TrackerType.ENGAGEMENT_SPIKE,
    status: TrackerStatus.ACTIVE,
    config: {
      trackedPostIds: [],
      trackedUserIds: [
        '44196397', // @elonmusk
      ],
      thresholds: {
        likesPerMinute: 100,
        retweetsPerMinute: 50,
        repliesPerMinute: 30,
      },
    },
  },
];

/** ── Mongoose schema (standalone, no NestJS deps) ── */
const trackerConfigSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    type: { type: String, required: true, index: true },
    status: { type: String, required: true, default: 'paused', index: true },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
    streamRuleIds: { type: [String], default: [] },
    lastRunAt: { type: Date },
    errorMessage: { type: String },
  },
  { timestamps: true },
);

const TrackerConfigModel =
  mongoose.models.TrackerConfig ||
  mongoose.model('TrackerConfig', trackerConfigSchema, 'trackerconfigs');

/**
 * Seed tracker configs into MongoDB.
 * Skips documents that already exist (matched by name + type).
 */
export async function seedTrackerConfigs(): Promise<void> {
  let inserted = 0;
  let skipped = 0;

  for (const seed of trackerConfigSeeds) {
    const exists = await TrackerConfigModel.findOne({
      name: seed.name,
      type: seed.type,
    });

    if (exists) {
      skipped++;
      console.log(
        `  ⏭  Skipped (already exists): "${seed.name}" [${seed.type}]`,
      );
    } else {
      await TrackerConfigModel.create(seed);
      inserted++;
      console.log(`  ✅ Inserted: "${seed.name}" [${seed.type}]`);
    }
  }

  console.log(
    `\nSeed complete: ${inserted} inserted, ${skipped} skipped (${trackerConfigSeeds.length} total)`,
  );
}

/** ── Standalone execution ── */
async function main(): Promise<void> {
  const username = process.env.MONGODB_USERNAME || 'admin';
  const password = process.env.MONGODB_PASSWORD || 'password';
  const host = process.env.MONGODB_HOST || 'localhost';
  const port = process.env.MONGODB_PORT || '27017';
  const dbName = process.env.MONGODB_DB_NAME || 'twitter-scraper';

  const uri = `mongodb://${username}:${password}@${host}:${port}/${dbName}?authSource=admin`;

  console.log(`Connecting to MongoDB at ${host}:${port}/${dbName}...`);
  await mongoose.connect(uri);
  console.log('Connected.\n');

  console.log('Seeding TrackerConfig collection...\n');
  await seedTrackerConfigs();

  await mongoose.disconnect();
  console.log('\nDisconnected from MongoDB.');
}

// Run if executed directly
main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
