import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlaywrightBrowserService } from './playwright-browser.service';
import { TweetRepository } from '../repositories/tweet.repository';
import { TWITTER_SELECTORS } from '../constants/twitter-selectors.constants';
import { ElementHandle, Page } from 'playwright';

@Injectable()
export class TwitterScraperService implements OnModuleInit {
  private readonly logger = new Logger(TwitterScraperService.name);

  constructor(
    private browserService: PlaywrightBrowserService,
    private tweetRepository: TweetRepository,
    private configService: ConfigService,
  ) { }

  async onModuleInit() {
    await this.browserService.initBrowser();
  }

  async login(username?: string, password?: string): Promise<boolean> {
    const page = this.browserService.getPage();

    const twitterUsername =
      username || this.configService.get<string>('TWITTER_USERNAME');
    const twitterPassword =
      password || this.configService.get<string>('TWITTER_PASSWORD');

    if (!twitterUsername || !twitterPassword) {
      throw new Error('Twitter credentials not provided');
    }

    try {
      this.logger.log('Starting Twitter login process...');

      await page.goto('https://x.com/i/flow/login');

      const usernameLocator = page.locator(
        TWITTER_SELECTORS.LOGIN.USERNAME_INPUT,
      );
      await usernameLocator.waitFor();
      usernameLocator.fill(twitterUsername);
      page.click(TWITTER_SELECTORS.LOGIN.NEXT_BUTTON);

      const passwordLocator = page.locator(
        TWITTER_SELECTORS.LOGIN.PASSWORD_INPUT,
      );
      await passwordLocator.waitFor();
      passwordLocator.fill(twitterPassword);

      await page.click(TWITTER_SELECTORS.LOGIN.LOGIN_BUTTON);
      await page.waitForURL('**/home', { timeout: 15000 });

      this.logger.log('Login successful');
      this.browserService.setAuthenticated(true);
      return true;
    } catch (error) {
      this.logger.error('Login failed', error);
      await this.browserService.takeScreenshot('login-error');
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  async ensureAuthenticated(): Promise<void> {
    if (!this.browserService.getIsAuthenticated()) {
      const isActive = await this.browserService.isSessionActive();
      if (!isActive) {
        await this.login();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Core scraping helpers
  // ---------------------------------------------------------------------------

  /**
   * Scroll-and-collect loop using Crawlee's PlaywrightCrawler.
   *
   * The crawler navigates to `url`, then runs the `collector` callback which
   * performs the scroll loop and returns the collected items. The result is
   * surfaced back to the caller via a shared `result` variable.
   */
  private async runCrawlee<T>(
    url: string,
    collector: (page: Page) => Promise<T>,
  ): Promise<T> {
    let result: T;
    let crawlError: Error | undefined;

    const crawler = this.browserService.createCrawler(
      async ({ page }) => {
        try {
          result = await collector(page);
        } catch (err) {
          crawlError = err;
        }
      },
    );

    await crawler.run([url]);

    if (crawlError) throw crawlError;
    return result!;
  }

  // ---------------------------------------------------------------------------
  // Public scraping methods
  // ---------------------------------------------------------------------------

  async getTweetsByUsername(
    username: string,
    options: {
      limit?: number;
      includeReplies?: boolean;
      includeRetweets?: boolean;
      onlyReplies?: boolean;
    } = {},
  ): Promise<any[]> {
    await this.ensureAuthenticated();

    const limit = options.limit || 10;
    const includeReplies = options.includeReplies ?? false;
    const includeRetweets = options.includeRetweets ?? true;
    const onlyReplies = options.onlyReplies ?? false;

    const profileUrl = onlyReplies
      ? `https://x.com/${username}/with_replies`
      : `https://x.com/${username}`;

    this.logger.log(`Scraping tweets from @${username}, limit: ${limit}`);

    try {
      const tweets = await this.runCrawlee(profileUrl, async (page) => {
        await page.locator(TWITTER_SELECTORS.TWEET.ARTICLE).first().waitFor();

        const collected: any[] = [];
        let previousHeight = 0;
        let scrollAttempts = 0;
        const maxScrollAttempts = 50;
        const scrollDelay = this.configService.get<number>(
          'SCRAPING_SCROLL_DELAY',
          2000,
        );

        while (collected.length < limit && scrollAttempts < maxScrollAttempts) {
          const tweetElements = await page.$$(TWITTER_SELECTORS.TWEET.ARTICLE);

          for (const element of tweetElements) {
            if (collected.length >= limit) break;
            try {
              const tweetData = await this.extractTweetData(page, element);
              console.log('tweetData.tweetType', tweetData.tweetType);
              console.log('tweetData.tweetId', tweetData.tweetId);
              console.log('tweetData.text', tweetData.text);


              if (
                (!includeRetweets && tweetData.tweetType === 'retweet') ||
                (!includeReplies && tweetData.tweetType === 'reply')
              ) {
                continue;
              }

              if (!collected.find((t) => t.tweetId === tweetData.tweetId)) {
                collected.push(tweetData);
              }
            } catch (err) {
              this.logger.warn('Failed to extract tweet data', err);
            }
          }

          const currentHeight = await page.evaluate(
            () => document.body.scrollHeight,
          );
          if (currentHeight === previousHeight) break;

          previousHeight = currentHeight;
          await page.evaluate(() =>
            window.scrollTo(0, document.body.scrollHeight),
          );
          await page.waitForTimeout(scrollDelay);
          scrollAttempts++;
        }

        return collected;
      });

      this.logger.log(`Scraped ${tweets.length} tweets from @${username}`);
      return tweets;
    } catch (error) {
      this.logger.error(`Error scraping tweets from @${username}`, error);
      await this.browserService.takeScreenshot(`error-${username}`);
      throw error;
    }
  }

  async getTweetsFromSearchTerm(
    searchTerm: string,
    options: {
      limit?: number;
      filters?: any;
    } = {},
  ): Promise<any[]> {
    await this.ensureAuthenticated();

    const limit = options.limit || 50;
    const filters = options.filters || {};
    const query = this.buildSearchQuery(searchTerm, filters);
    const searchUrl = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`;

    this.logger.log(`Searching tweets for: "${query}", limit: ${limit}`);

    try {
      const tweets = await this.runCrawlee(searchUrl, async (page) => {
        await page.locator(TWITTER_SELECTORS.TWEET.ARTICLE).first().waitFor();

        const collected: any[] = [];
        let previousHeight = 0;
        let scrollAttempts = 0;
        const maxScrollAttempts = 50;
        const scrollDelay = this.configService.get<number>(
          'SCRAPING_SCROLL_DELAY',
          2000,
        );

        while (collected.length < limit && scrollAttempts < maxScrollAttempts) {
          const tweetElements = await page.$$(TWITTER_SELECTORS.TWEET.ARTICLE);

          this.logger.debug(
            `Scroll #${scrollAttempts}: ${tweetElements.length} tweet elements found`,
          );

          for (const element of tweetElements) {
            if (collected.length >= limit) break;
            try {
              const tweetData = await this.extractTweetData(page, element);

              if (!collected.find((t) => t.tweetId === tweetData.tweetId)) {
                collected.push(tweetData);
              }
            } catch (err) {
              this.logger.warn('Failed to extract tweet data', err);
            }
          }

          const currentHeight = await page.evaluate(
            () => document.body.scrollHeight,
          );
          if (currentHeight === previousHeight) break;

          previousHeight = currentHeight;
          await page.evaluate(() =>
            window.scrollTo(0, document.body.scrollHeight),
          );
          await page.waitForTimeout(scrollDelay);
          scrollAttempts++;
        }

        return collected;
      });

      this.logger.log(`Found ${tweets.length} tweets for search: "${query}"`);
      return tweets;
    } catch (error) {
      this.logger.error(`Error searching tweets for: "${query}"`, error);
      await this.browserService.takeScreenshot(`error-search-${searchTerm}`);
      throw error;
    }
  }

  async getTweetById(tweetId: string): Promise<any> {
    await this.ensureAuthenticated();

    try {
      const cachedTweet = await this.tweetRepository.findById(tweetId);
      if (cachedTweet) {
        this.logger.log(`Tweet ${tweetId} found in database`);
        return cachedTweet;
      }

      this.logger.log(`Scraping tweet ${tweetId} from Twitter`);
      const tweetUrl = `https://x.com/i/status/${tweetId}`;

      const tweetData = await this.runCrawlee(tweetUrl, async (page) => {
        await page.locator(TWITTER_SELECTORS.TWEET.ARTICLE).first().waitFor();

        const tweetElement = await page.$(TWITTER_SELECTORS.TWEET.ARTICLE);
        if (!tweetElement) throw new Error('Tweet not found');

        return this.extractTweetData(page, tweetElement);
      });

      await this.tweetRepository.create(tweetData);
      return tweetData;
    } catch (error) {
      this.logger.error(`Error getting tweet ${tweetId}`, error);
      throw error;
    }
  }

  async getUserProfile(username: string): Promise<any> {
    await this.ensureAuthenticated();

    this.logger.log(`Getting profile for @${username}`);

    try {
      const profileData = await this.runCrawlee(
        `https://x.com/${username}`,
        async (page) => {
          await page.locator(TWITTER_SELECTORS.PROFILE.USERNAME).waitFor();

          return page.evaluate((selectors) => {
            const getText = (selector: string) => {
              const elem = document.querySelector(selector);
              return elem ? elem.textContent.trim() : '';
            };

            const getNumber = (text: string) => {
              if (!text) return 0;

              const cleanText = text.replace(/\s+/g, ' ').trim().toLowerCase();
              let multiplier = 1;

              if (cleanText.includes('k')) multiplier = 1000;
              else if (cleanText.includes('mil')) multiplier = 1000;
              else if (cleanText.includes('m')) multiplier = 1000000;
              else if (cleanText.includes('b')) multiplier = 1000000000;

              const match = cleanText.match(/[\d,.]+/);
              if (!match) return 0;

              let numStr = match[0];
              if (multiplier > 1) {
                numStr = numStr.replace(',', '.');
                return Math.floor(parseFloat(numStr) * multiplier);
              }

              return parseInt(numStr.replace(/[,.]/g, ''), 10);
            };

            const username = getText(selectors.PROFILE.USERNAME);
            const bio = getText(selectors.PROFILE.BIO);
            const followersText = getText(selectors.PROFILE.FOLLOWERS);
            const followingText = getText(selectors.PROFILE.FOLLOWING);

            return {
              username,
              bio,
              followers: getNumber(followersText),
              following: getNumber(followingText),
            };
          }, TWITTER_SELECTORS);
        },
      );

      return profileData;
    } catch (error) {
      this.logger.error(`Error getting profile for @${username}`, error);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildSearchQuery(term: string, filters: any): string {
    let query = term;

    if (filters.exactPhrase) {
      query += ` "${filters.exactPhrase}"`;
    }

    if (filters.anyOfTheseWords && filters.anyOfTheseWords.length > 0) {
      const orQuery = filters.anyOfTheseWords.join(' OR ');
      query += ` (${orQuery})`;
    }

    if (filters.noneOfTheseWords && filters.noneOfTheseWords.length > 0) {
      filters.noneOfTheseWords.forEach((word) => {
        query += ` -${word}`;
      });
    }

    if (filters.hashtags && filters.hashtags.length > 0) {
      const hashtagQuery = filters.hashtags
        .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`))
        .join(' OR ');
      query += ` (${hashtagQuery})`;
    }

    if (filters.lang) {
      query += ` lang:${filters.lang}`;
    }

    if (filters.fromAccounts && filters.fromAccounts.length > 0) {
      const fromQuery = filters.fromAccounts
        .map((acc) => `from:${acc}`)
        .join(' OR ');
      query += ` (${fromQuery})`;
    }

    if (filters.toAccounts && filters.toAccounts.length > 0) {
      const toQuery = filters.toAccounts
        .map((acc) => `to:${acc}`)
        .join(' OR ');
      query += ` (${toQuery})`;
    }

    if (filters.mentioningAccounts && filters.mentioningAccounts.length > 0) {
      const mentionQuery = filters.mentioningAccounts
        .map((acc) => (acc.startsWith('@') ? acc : `@${acc}`))
        .join(' OR ');
      query += ` (${mentionQuery})`;
    }

    if (filters.minReplies) query += ` min_replies:${filters.minReplies}`;
    if (filters.minFaves) query += ` min_faves:${filters.minFaves}`;
    if (filters.minRetweets) query += ` min_retweets:${filters.minRetweets}`;
    if (filters.until) query += ` until:${filters.until}`;
    if (filters.since) query += ` since:${filters.since}`;

    return query.trim();
  }

  /**
   * Extract structured tweet data from a tweet article element.
   * Now receives the `page` explicitly (no longer calls browserService.getPage()).
   */
  private async extractTweetData(
    page: Page,
    element: ElementHandle<SVGElement | HTMLElement>,
  ): Promise<any> {
    // Expand "Show more" button if present
    try {
      const showMoreButton = await element.$(
        TWITTER_SELECTORS.TWEET.SHOW_MORE_BUTTON,
      );
      if (showMoreButton) {
        const href = await showMoreButton.getAttribute('href');
        if (!href || href === '#' || href === '') {
          await showMoreButton.click();
          await page.waitForTimeout(500);
        }
      }
    } catch (e) {
      // Ignore errors when trying to expand
    }

    const tweetData = await element.evaluate((el: Element, selectors: any) => {
      const getText = (selector: string) => {
        const elem = el.querySelector(selector);
        return elem ? elem.textContent.trim() : '';
      };

      const getNumber = (selector: string) => {
        const text = getText(selector);
        if (!text) return 0;

        const cleanText = text.replace(/\s+/g, ' ').trim().toLowerCase();
        let multiplier = 1;

        if (cleanText.includes('k')) multiplier = 1000;
        else if (cleanText.includes('mil')) multiplier = 1000;
        else if (cleanText.includes('m')) multiplier = 1000000;
        else if (cleanText.includes('b')) multiplier = 1000000000;

        const match = cleanText.match(/[\d,.]+/);
        if (!match) return 0;

        let numStr = match[0];
        if (multiplier > 1) {
          numStr = numStr.replace(',', '.');
          return Math.floor(parseFloat(numStr) * multiplier);
        }

        return parseInt(numStr.replace(/[,.]/g, ''), 10);
      };

      // Tweet ID from status link
      const tweetLink = el.querySelector('a[href*="/status/"]');
      const tweetId = tweetLink
        ? tweetLink.getAttribute('href')?.match(/status\/(\d+)/)?.[1] || ''
        : '';

      // Tweet text
      const text = getText(selectors.TWEET.TEXT);

      // Author info
      const authorElement = el.querySelector(selectors.TWEET.AUTHOR_NAME);
      const authorUsername = authorElement
        ? authorElement.querySelector('a').getAttribute('href').replace('/', '')
        : '';
      const authorDisplayName = authorElement
        ? authorElement.querySelector('a')?.textContent?.trim() || ''
        : '';

      // Timestamp
      const timeElement = el.querySelector(selectors.TWEET.TIMESTAMP);
      const timestamp = timeElement ? timeElement.getAttribute('datetime') : '';

      // Metrics
      const likes = getNumber(selectors.TWEET.LIKE_COUNT);
      const retweets = getNumber(selectors.TWEET.RETWEET_COUNT);
      const replies = getNumber(selectors.TWEET.REPLY_COUNT);
      const views = getNumber(selectors.TWEET.VIEW_COUNT);

      // Media
      const mediaElements = el.querySelectorAll(selectors.TWEET.MEDIA);
      const media = Array.from(mediaElements)
        .map((mediaEl: any) => {
          const img = mediaEl.querySelector('img');
          const video = mediaEl.querySelector('video');

          if (img) return { type: 'image', url: img.src, thumbnailUrl: img.src };
          if (video) return { type: 'video', url: video.src, thumbnailUrl: video.poster };
          return null;
        })
        .filter(Boolean);

      // Hashtags & mentions
      const hashtags = (text.match(/#\w+/g) || []).map((tag) =>
        tag.substring(1),
      );
      const mentions = (text.match(/@\w+/g) || []).map((mention) =>
        mention.substring(1),
      );

      // Tweet type
      let tweetType = 'original';
      const socialContextElement = el.querySelector('[data-testid="socialContext"]');

      if (
        socialContextElement &&
        (
          socialContextElement.textContent.toLowerCase().includes('pinned') ||
          socialContextElement.textContent.toLowerCase().includes('fijado')
        )
      ) {
        tweetType = 'pinned';
      } else if (
        socialContextElement &&
        (
          socialContextElement.textContent.toLowerCase().includes('reposted') ||
          socialContextElement.textContent.toLowerCase().includes('retweeted') ||
          socialContextElement.textContent.toLowerCase().includes('reposteó')
        )
      ) {
        tweetType = 'retweet';
      } else if (el.querySelector('div[aria-labelledby]')) {
        tweetType = 'quote';
      }

      return {
        tweetId,
        text,
        author: {
          username: authorUsername,
          displayName: authorDisplayName,
          userId: '',
          profileImageUrl: '',
          verified: !!el.querySelector('[data-testid="icon-verified"]'),
        },
        tweetCreatedAt: timestamp,
        metrics: { likes, retweets, replies, views, bookmarks: 0 },
        media,
        hashtags,
        mentions,
        urls: [],
        tweetType,
        language: 'en',
        isThread: false,
        threadPosition: 0,
      };
    }, TWITTER_SELECTORS);

    return tweetData;
  }
}
