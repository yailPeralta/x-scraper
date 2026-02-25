import { Injectable, Logger } from '@nestjs/common';
import { XdkClientService } from '../../../../common/services/twitter/xdk-client.service';

@Injectable()
export class TwitterBotService {
  private readonly logger = new Logger(TwitterBotService.name);

  constructor(private readonly xdkClient: XdkClientService) {}

  /**
   * Create a new post (tweet).
   */
  async createPost(
    text: string,
    options?: {
      mediaIds?: string[];
      replySettings?:
        | 'following'
        | 'mentionedUsers'
        | 'subscribers'
        | 'verified';
      quoteTweetId?: string;
    },
  ): Promise<any> {
    this.ensureWriteEnabled();

    const body: any = { text };

    if (options?.mediaIds?.length) {
      body.media = { media_ids: options.mediaIds };
    }

    if (options?.replySettings) {
      body.replySettings = options.replySettings;
    }

    if (options?.quoteTweetId) {
      body.quoteTweetId = options.quoteTweetId;
    }

    const response = await this.xdkClient.writeClient.posts.create(body);
    this.logger.log(`Created post: ${response?.data?.id || 'unknown'}`);
    return response;
  }

  /**
   * Quote tweet another post.
   */
  async quoteTweet(text: string, quotedTweetId: string): Promise<any> {
    return this.createPost(text, { quoteTweetId: quotedTweetId });
  }

  /**
   * Reply to a specific tweet.
   */
  async replyToTweet(text: string, inReplyToTweetId: string): Promise<any> {
    this.ensureWriteEnabled();

    const body: any = {
      text,
      reply: { in_reply_to_tweet_id: inReplyToTweetId },
    };

    const response = await this.xdkClient.writeClient.posts.create(body);
    this.logger.log(
      `Replied to tweet ${inReplyToTweetId}: ${response?.data?.id || 'unknown'}`,
    );
    return response;
  }

  /**
   * Retweet (repost) a tweet.
   */
  async repost(tweetId: string): Promise<any> {
    this.ensureWriteEnabled();

    const me = await this.getAuthenticatedUserId();
    const response = await this.xdkClient.writeClient.users.repostPost(me, {
      body: { tweetId },
    });
    this.logger.log(`Reposted tweet: ${tweetId}`);
    return response;
  }

  /**
   * Like a tweet.
   */
  async likeTweet(tweetId: string): Promise<any> {
    this.ensureWriteEnabled();

    const me = await this.getAuthenticatedUserId();
    const response = await this.xdkClient.writeClient.users.likePost(me, {
      body: { tweetId },
    });
    this.logger.log(`Liked tweet: ${tweetId}`);
    return response;
  }

  /**
   * Unlike a tweet.
   */
  async unlikeTweet(tweetId: string): Promise<any> {
    this.ensureWriteEnabled();

    const me = await this.getAuthenticatedUserId();
    const response = await this.xdkClient.writeClient.users.unlikePost(
      me,
      tweetId,
    );
    this.logger.log(`Unliked tweet: ${tweetId}`);
    return response;
  }

  /**
   * Follow a user.
   */
  async followUser(targetUserId: string): Promise<any> {
    this.ensureWriteEnabled();

    const me = await this.getAuthenticatedUserId();
    const response = await this.xdkClient.writeClient.users.followUser(me, {
      body: { targetUserId },
    });
    this.logger.log(`Followed user: ${targetUserId}`);
    return response;
  }

  /**
   * Unfollow a user.
   */
  async unfollowUser(targetUserId: string): Promise<any> {
    this.ensureWriteEnabled();

    const me = await this.getAuthenticatedUserId();
    const response = await this.xdkClient.writeClient.users.unfollowUser(
      me,
      targetUserId,
    );
    this.logger.log(`Unfollowed user: ${targetUserId}`);
    return response;
  }

  /**
   * Delete a tweet.
   */
  async deleteTweet(tweetId: string): Promise<any> {
    this.ensureWriteEnabled();

    const response = await this.xdkClient.writeClient.posts.delete(tweetId);
    this.logger.log(`Deleted tweet: ${tweetId}`);
    return response;
  }

  /**
   * Get the authenticated user's ID.
   * Caches the result after first call.
   */
  private _authenticatedUserId: string | null = null;

  private async getAuthenticatedUserId(): Promise<string> {
    if (this._authenticatedUserId) return this._authenticatedUserId;

    const response = await this.xdkClient.writeClient.users.getMe();
    const userId = response?.data?.id;
    if (!userId) {
      throw new Error('Failed to get authenticated user ID');
    }
    this._authenticatedUserId = userId;
    return userId;
  }

  /**
   * Check if write operations are enabled.
   */
  isWriteEnabled(): boolean {
    return this.xdkClient.isWriteEnabled();
  }

  private ensureWriteEnabled(): void {
    if (!this.xdkClient.isWriteEnabled()) {
      throw new Error(
        'Bot write operations are disabled. Configure OAuth1 credentials (X_API_KEY, X_API_SECRET, X_API_ACCESS_TOKEN, X_API_ACCESS_TOKEN_SECRET) to enable.',
      );
    }
  }
}
