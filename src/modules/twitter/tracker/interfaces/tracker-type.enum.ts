export enum TrackerType {
  USER_TWEET = 'user_tweet',
  HASHTAG_TWEET = 'hashtag_tweet',
  KEYWORD_TWEET = 'keyword_tweet',
  PROFILE_CHANGE = 'profile_change',
  FOLLOWER_CHANGE = 'follower_change',
  CASHTAG_MENTION = 'cashtag_mention',
  TREND = 'trend',
  ENGAGEMENT_SPIKE = 'engagement_spike',
}

export enum TrackerStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  ERROR = 'error',
}
