/**
 * Default polling intervals (in milliseconds)
 */
export const DEFAULT_PROFILE_POLL_INTERVAL = 300_000; // 5 minutes
export const DEFAULT_FOLLOWER_POLL_INTERVAL = 600_000; // 10 minutes
export const DEFAULT_TREND_POLL_INTERVAL = 300_000; // 5 minutes
export const DEFAULT_ENGAGEMENT_POLL_INTERVAL = 60_000; // 1 minute

/**
 * Twitter Filtered Stream rule limits
 * @see https://developer.x.com/en/docs/twitter-api/tweets/filtered-stream/introduction
 */
export const STREAM_MAX_RULES_BASIC = 5;
export const STREAM_MAX_RULES_PRO = 1000;
export const STREAM_MAX_RULE_LENGTH = 512; // characters per rule

/**
 * Default WOEID for trends (1 = Worldwide)
 */
export const DEFAULT_TREND_WOEID = 1;

/**
 * Reconnection settings for the filtered stream
 */
export const STREAM_MAX_RECONNECT_ATTEMPTS = 10;
export const STREAM_INITIAL_RECONNECT_DELAY = 1_000; // 1 second

/**
 * Engagement spike detection thresholds
 */
export const ENGAGEMENT_SPIKE_MULTIPLIER = 3; // 3x the average = spike
export const ENGAGEMENT_MIN_SNAPSHOTS_FOR_SPIKE = 3; // minimum snapshots before detecting spikes

/**
 * Batch sizes for bulk operations
 */
export const BATCH_UPSERT_SIZE = 100;

/**
 * Tweet fields to request from the API
 */
export const DEFAULT_TWEET_FIELDS = [
  'id',
  'text',
  'author_id',
  'created_at',
  'public_metrics',
  'entities',
  'referenced_tweets',
  'attachments',
  'context_annotations',
  'conversation_id',
  'lang',
];

/**
 * User fields to request from the API
 */
export const DEFAULT_USER_FIELDS = [
  'id',
  'name',
  'username',
  'description',
  'profile_image_url',
  'public_metrics',
  'verified',
  'verified_type',
  'location',
  'url',
  'protected',
  'created_at',
];

/**
 * Expansions to request from the API
 */
export const DEFAULT_EXPANSIONS = [
  'author_id',
  'referenced_tweets.id',
  'attachments.media_keys',
  'entities.mentions.username',
];

/**
 * Media fields to request from the API
 */
export const DEFAULT_MEDIA_FIELDS = [
  'media_key',
  'type',
  'url',
  'preview_image_url',
  'alt_text',
  'public_metrics',
];
