import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, OAuth1 } from '@xdevplatform/xdk';
import { EnvironmentVariables } from '../../config/env.validation';

@Injectable()
export class XdkClientService implements OnModuleInit {
  private readonly logger = new Logger(XdkClientService.name);

  private _readClient: InstanceType<typeof Client>;
  private _writeClient: InstanceType<typeof Client> | null = null;

  constructor(
    private readonly configService: ConfigService<EnvironmentVariables>,
  ) {}

  onModuleInit(): void {
    this.initializeClients();
  }

  /**
   * Initialize the XDK clients.
   * - readClient: uses Bearer Token for read operations (search, stream, user lookup)
   * - writeClient: uses OAuth1 for write operations (post, retweet, like) — only if credentials are provided
   */
  private initializeClients(): void {
    const bearerToken = this.configService.get<string>('X_API_BEARER_TOKEN');

    if (!bearerToken) {
      throw new Error(
        'X_API_BEARER_TOKEN is required for the Twitter Tracker module',
      );
    }

    // Read client with Bearer Token
    this._readClient = new Client({ bearerToken });
    this.logger.log('XDK read client initialized with Bearer Token');

    // Write client with OAuth1 (optional)
    const apiKey = this.configService.get<string>('X_API_KEY');
    const apiSecret = this.configService.get<string>('X_API_SECRET');
    const accessToken = this.configService.get<string>('X_API_ACCESS_TOKEN');
    const accessTokenSecret = this.configService.get<string>(
      'X_API_ACCESS_TOKEN_SECRET',
    );

    if (apiKey && apiSecret && accessToken && accessTokenSecret) {
      const oauth1 = new OAuth1({
        apiKey,
        apiSecret,
        callback: '',
        accessToken,
        accessTokenSecret,
      });

      this._writeClient = new Client({ oauth1 });
      this.logger.log('XDK write client initialized with OAuth1 credentials');
    } else {
      this.logger.warn(
        'OAuth1 credentials not fully configured — write operations (post, retweet, like) will be disabled',
      );
    }
  }

  /**
   * Get the read-only client (Bearer Token auth).
   * Used for: search, filtered stream, user lookup, trends, etc.
   */
  get readClient(): InstanceType<typeof Client> {
    return this._readClient;
  }

  /**
   * Get the write client (OAuth1 auth).
   * Used for: posting tweets, retweeting, liking, replying, etc.
   * @throws Error if OAuth1 credentials are not configured
   */
  get writeClient(): InstanceType<typeof Client> {
    if (!this._writeClient) {
      throw new Error(
        'Write client is not available. Configure X_API_KEY, X_API_SECRET, X_API_ACCESS_TOKEN, and X_API_ACCESS_TOKEN_SECRET to enable write operations.',
      );
    }
    return this._writeClient;
  }

  /**
   * Check if write operations are enabled (OAuth1 credentials configured).
   */
  isWriteEnabled(): boolean {
    return this._writeClient !== null;
  }
}
