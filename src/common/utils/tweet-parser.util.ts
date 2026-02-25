import { TrackedTweet } from '../database/mongodb/schemas/twitter/tracked-tweet.schema';

/**
 * Parse a tweet from a filtered stream event into a TrackedTweet-compatible object.
 * The stream event shape from XDK is:
 * {
 *   data: { id, text, author_id, created_at, public_metrics, entities, ... },
 *   includes: { users: [...], media: [...], tweets: [...] },
 *   matching_rules: [{ id, tag }]
 * }
 */
export function parseTweetFromStreamEvent(
  event: any,
): Partial<TrackedTweet> | null {
  const tweet = event?.data;
  if (!tweet?.id) return null;

  const includes = event?.includes || {};
  const users = includes?.users || [];
  const mediaIncludes = includes?.media || [];

  // Find author info from includes
  const author = users.find((u: any) => u.id === tweet.author_id);

  // Extract entities
  const entities = tweet.entities || {};
  const hashtags = (entities.hashtags || []).map((h: any) => h.tag);
  const cashtags = (entities.cashtags || []).map((c: any) => c.tag);
  const mentions = (entities.mentions || []).map((m: any) => m.username);
  const urls = (entities.urls || []).map((u: any) => u.expanded_url || u.url);

  // Extract media
  const attachmentMediaKeys =
    tweet.attachments?.media_keys || [];
  const media = attachmentMediaKeys
    .map((key: string) => {
      const m = mediaIncludes.find((mi: any) => mi.media_key === key);
      if (!m) return null;
      return {
        type: m.type === 'animated_gif' ? 'gif' : m.type,
        url: m.url || m.preview_image_url || '',
        previewImageUrl: m.preview_image_url,
        altText: m.alt_text,
      };
    })
    .filter(Boolean);

  // Extract metrics
  const publicMetrics = tweet.public_metrics || {};
  const metrics = {
    likes: publicMetrics.like_count || 0,
    retweets: publicMetrics.retweet_count || 0,
    replies: publicMetrics.reply_count || 0,
    views: publicMetrics.impression_count || 0,
    bookmarks: publicMetrics.bookmark_count || 0,
  };

  // Determine tweet type
  let tweetType = 'original';
  const referencedTweets = tweet.referenced_tweets || [];
  if (referencedTweets.length > 0) {
    const refType = referencedTweets[0].type;
    if (refType === 'retweeted') tweetType = 'retweet';
    else if (refType === 'replied_to') tweetType = 'reply';
    else if (refType === 'quoted') tweetType = 'quote';
  }

  return {
    tweetId: tweet.id,
    authorId: tweet.author_id,
    authorUsername: author?.username || '',
    text: tweet.text,
    tweetCreatedAt: tweet.created_at ? new Date(tweet.created_at) : new Date(),
    metrics,
    media,
    hashtags,
    cashtags,
    mentions,
    urls,
    tweetType,
    rawData: event,
  };
}

/**
 * Parse a user object from the XDK API response into a profile snapshot shape.
 */
export function parseUserProfile(user: any): Record<string, any> | null {
  if (!user?.id) return null;

  const publicMetrics = user.public_metrics || {};

  return {
    userId: user.id,
    username: user.username,
    displayName: user.name,
    bio: user.description || '',
    profileImageUrl: user.profile_image_url || '',
    profileBannerUrl: user.profile_banner_url || '',
    location: user.location || '',
    url: user.url || '',
    verified: user.verified || false,
    verifiedType: user.verified_type || '',
    subscriptionType: user.subscription_type || '',
    followersCount: publicMetrics.followers_count || 0,
    followingCount: publicMetrics.following_count || 0,
    tweetCount: publicMetrics.tweet_count || 0,
    listedCount: publicMetrics.listed_count || 0,
  };
}
