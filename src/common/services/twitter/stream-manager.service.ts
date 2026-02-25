import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { XdkClientService } from './xdk-client.service';
import {
  STREAM_MAX_RECONNECT_ATTEMPTS,
  DEFAULT_TWEET_FIELDS,
  DEFAULT_USER_FIELDS,
  DEFAULT_EXPANSIONS,
  DEFAULT_MEDIA_FIELDS,
} from 'src/modules/twitter/tracker/constants/tracker.constants';

export interface StreamRule {
  value: string;
  tag: string;
}

export interface StreamRuleResponse {
  id: string;
  value: string;
  tag: string;
}

type TweetCallback = (event: any) => void;

/**
 * EventDrivenStream shape from @xdevplatform/xdk.
 * The class is not exported from the package, so we define the interface here.
 */
interface IEventDrivenStream {
  on(event: string, listener: Function): this;
  off(event: string, listener: Function): this;
  close(): void;
  autoReconnectEnabled: boolean;
  maxReconnectAttemptsCount: number;
  [Symbol.asyncIterator](): AsyncGenerator<any, void, unknown>;
}

@Injectable()
export class StreamManagerService implements OnModuleDestroy {
  private readonly logger = new Logger(StreamManagerService.name);

  private stream: IEventDrivenStream | null = null;
  private isConnected = false;
  private tagCallbacks = new Map<string, TweetCallback[]>();

  constructor(private readonly xdkClient: XdkClientService) {}

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  /**
   * Add rules to the filtered stream.
   * @param rules Array of { value, tag } objects
   * @returns The created rules with their IDs
   */
  async addRules(rules: StreamRule[]): Promise<StreamRuleResponse[]> {
    const client = this.xdkClient.readClient;

    const body = {
      add: rules.map((rule) => ({
        value: rule.value,
        tag: rule.tag,
      })),
    };

    const response = await client.stream.updateRules(body);

    const createdRules: StreamRuleResponse[] = (response?.data || []).map(
      (rule: any) => ({
        id: rule.id,
        value: rule.value,
        tag: rule.tag,
      }),
    );

    this.logger.log(
      `Added ${createdRules.length} stream rules: ${createdRules.map((r) => r.tag).join(', ')}`,
    );

    return createdRules;
  }

  /**
   * Remove rules from the filtered stream by their IDs.
   * @param ruleIds Array of rule IDs to remove
   */
  async removeRules(ruleIds: string[]): Promise<void> {
    if (ruleIds.length === 0) return;

    const client = this.xdkClient.readClient;

    const body = {
      delete: { ids: ruleIds },
    };

    await client.stream.updateRules(body);

    this.logger.log(`Removed ${ruleIds.length} stream rules`);
  }

  /**
   * Get all currently active stream rules.
   */
  async getRules(): Promise<StreamRuleResponse[]> {
    const client = this.xdkClient.readClient;

    const response = await client.stream.getRules();

    return (response?.data || []).map((rule: any) => ({
      id: rule.id,
      value: rule.value,
      tag: rule.tag,
    }));
  }

  /**
   * Connect to the filtered stream and start receiving tweets.
   * Routes incoming tweets to registered callbacks based on matching_rules[].tag.
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      this.logger.warn('Stream is already connected');
      return;
    }

    const client = this.xdkClient.readClient;

    try {
      this.stream = await client.stream.posts({
        tweetFields: DEFAULT_TWEET_FIELDS,
        userFields: DEFAULT_USER_FIELDS,
        expansions: DEFAULT_EXPANSIONS,
        mediaFields: DEFAULT_MEDIA_FIELDS,
      });

      this.stream.maxReconnectAttemptsCount = STREAM_MAX_RECONNECT_ATTEMPTS;
      this.stream.autoReconnectEnabled = true;

      this.stream.on('data', (event: any) => {
        this.handleStreamData(event);
      });

      this.stream.on('error', (error: any) => {
        this.logger.error(`Stream error: ${error?.message || error}`);
      });

      this.stream.on('close', () => {
        this.logger.warn('Stream connection closed');
        this.isConnected = false;
      });

      this.isConnected = true;
      this.logger.log('Connected to filtered stream');
    } catch (error) {
      this.logger.error(
        `Failed to connect to filtered stream: ${error?.message || error}`,
      );
      throw error;
    }
  }

  /**
   * Disconnect from the filtered stream.
   */
  async disconnect(): Promise<void> {
    if (this.stream) {
      this.stream.close();
      this.stream = null;
      this.isConnected = false;
      this.logger.log('Disconnected from filtered stream');
    }
  }

  /**
   * Register a callback for tweets matching a specific tag.
   * @param tag The rule tag to listen for
   * @param callback Function to call when a matching tweet arrives
   */
  onTweet(tag: string, callback: TweetCallback): void {
    const existing = this.tagCallbacks.get(tag) || [];
    existing.push(callback);
    this.tagCallbacks.set(tag, existing);
    this.logger.debug(`Registered callback for tag: ${tag}`);
  }

  /**
   * Remove all callbacks for a specific tag.
   * @param tag The rule tag to stop listening for
   */
  offTweet(tag: string): void {
    this.tagCallbacks.delete(tag);
    this.logger.debug(`Removed callbacks for tag: ${tag}`);
  }

  /**
   * Check if the stream is currently connected.
   */
  isStreamConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Handle incoming stream data and route to registered callbacks.
   */
  private handleStreamData(event: any): void {
    const matchingRules: Array<{ id: string; tag: string }> =
      event?.matching_rules || [];

    if (matchingRules.length === 0) {
      this.logger.debug('Received stream event with no matching rules');
      return;
    }

    for (const rule of matchingRules) {
      const callbacks = this.tagCallbacks.get(rule.tag);
      if (callbacks && callbacks.length > 0) {
        for (const callback of callbacks) {
          try {
            callback(event);
          } catch (error) {
            this.logger.error(
              `Error in callback for tag "${rule.tag}": ${error?.message || error}`,
            );
          }
        }
      }
    }
  }
}
