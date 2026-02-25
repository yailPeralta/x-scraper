import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlaywrightBrowserService } from './playwright-browser.service';
import { TweetRepository } from '../repositories/tweet.repository';
import { XUserRepository } from '../repositories/x-user.repository';
import { TWITTER_SELECTORS } from '../constants/twitter-selectors.constants';
import { ElementHandle, Page } from 'playwright';
import { PlaywrightCrawler } from 'crawlee';

@Injectable()
export class TwitterScraperService implements OnModuleInit {
  private readonly logger = new Logger(TwitterScraperService.name);
  private playwrightCrawler: PlaywrightCrawler;

  constructor(
    private browserService: PlaywrightBrowserService,
    private tweetRepository: TweetRepository,
    private xUserRepository: XUserRepository,
    private configService: ConfigService,
  ) {}

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
   * Navigate to `url` using the existing persistent browser context and run
   * the `collector` callback. This reuses the authenticated session (cookies,
   * storage) without launching a second browser instance.
   *
   * Use this for authenticated scraping tasks (search, tweet-by-id, etc.).
   */
  private async runWithPage<T>(
    url: string,
    collector: (page: Page) => Promise<T>,
  ): Promise<T> {
    const page = this.browserService.getPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    return collector(page);
  }

  /**
   * Scroll-and-collect loop using Crawlee's PlaywrightCrawler.
   *
   * The crawler navigates to `url`, then runs the `collector` callback which
   * performs the scroll loop and returns the collected items. The result is
   * surfaced back to the caller via a shared `result` variable.
   *
   * NOTE: Crawlee launches its own browser instance (without userDataDir) so
   * this method does NOT share cookies/session with the persistent context.
   * Use `runWithPage()` for authenticated tasks instead.
   */
  private async runCrawlee<T>(
    url: string,
    collector: (page: Page) => Promise<T>,
  ): Promise<T> {
    let result: T;
    let crawlError: Error | undefined;

    if (!this.playwrightCrawler) {
      this.playwrightCrawler = await this.browserService.createCrawler(
        async ({ page }) => {
          try {
            result = await collector(page);
          } catch (err) {
            crawlError = err;
          }
        },
      );
    }

    await this.playwrightCrawler.run([url]);

    if (crawlError) throw crawlError;
    return result!;
  }

  private async paginateAndExtractTweets(
    page: Page,
    limit: number,
    includeRetweets: boolean,
    includeQuoted: boolean,
  ): Promise<any[]> {
    const collected: any[] = [];
    // O(1) deduplication via Set of tweet IDs
    const seenIds = new Set<string>();
    let scrollAttempts = 0;
    const maxScrollAttempts = 50;
    let consecutiveEmpty = 0;
    const MAX_CONSECUTIVE_EMPTY = 5;
    const scrollDelay = this.configService.get<number>(
      'SCRAPING_SCROLL_DELAY',
      2000,
    );

    await page.waitForSelector(TWITTER_SELECTORS.TWEET.ARTICLE);

    while (collected.length < limit && scrollAttempts < maxScrollAttempts) {
      const countBefore = collected.length;
      const tweetElements = await page.$$(TWITTER_SELECTORS.TWEET.ARTICLE);

      for (const element of tweetElements) {
        if (collected.length >= limit) break;
        try {
          const rawTweetData = await this.extractTweetData(page, element);
          const tweetData = await this.processTweetWithAuthor(rawTweetData);

          if (
            (!includeRetweets && tweetData.tweetType === 'retweet') ||
            (!includeQuoted && tweetData.tweetType === 'quote')
          ) {
            continue;
          }

          // O(1) duplicate check via Set instead of O(n) Array.find()
          if (tweetData.tweetId && !seenIds.has(tweetData.tweetId)) {
            seenIds.add(tweetData.tweetId);
            collected.push(tweetData);
          }
        } catch (err) {
          this.logger.warn('Failed to extract tweet data', err);
        }
      }

      // Declare feed exhausted only after MAX_CONSECUTIVE_EMPTY scrolls with
      // no new unique tweets — tolerates X.com virtual DOM viewport overlap.
      if (collected.length === countBefore) {
        consecutiveEmpty++;
        if (consecutiveEmpty >= MAX_CONSECUTIVE_EMPTY) break;
      } else {
        consecutiveEmpty = 0;
      }

      // Scroll to the bottom of the currently rendered content so X.com's
      // virtual scroller triggers loading the next batch of tweets.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(scrollDelay);
      scrollAttempts++;
    }

    return collected;
  }

  // ---------------------------------------------------------------------------
  // Public scraping methods
  // ---------------------------------------------------------------------------

  async getTweetsByUsername(
    username: string,
    options: {
      limit?: number;
      includeRetweets?: boolean;
      onlyReplies?: boolean;
      includeQuoted?: boolean;
    } = {},
  ): Promise<any[]> {
    const limit = options.limit || 10;
    const includeRetweets = options.includeRetweets ?? false;
    const includeQuoted = options.includeQuoted ?? false;
    const onlyReplies = options.onlyReplies ?? false;

    const profileUrl = onlyReplies
      ? `https://x.com/${username}/with_replies`
      : `https://x.com/${username}`;

    this.logger.log(`Scraping tweets from @${username}, limit: ${limit}`);

    try {
      const tweets = await this.runCrawlee(profileUrl, async (page) => {
        return await this.paginateAndExtractTweets(
          page,
          limit,
          includeRetweets,
          includeQuoted,
        );
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

    this.logger.log(searchUrl);
    this.logger.log(`Searching tweets for: "${query}", limit: ${limit}`);

    try {
      const tweets = await this.runWithPage(searchUrl, async (page) => {
        await page.locator(TWITTER_SELECTORS.TWEET.ARTICLE).first().waitFor();

        const collected: any[] = [];
        // O(1) deduplication via Set of tweet IDs
        const seenIds = new Set<string>();
        let scrollAttempts = 0;
        const maxScrollAttempts = 50;
        let consecutiveEmpty = 0;
        const MAX_CONSECUTIVE_EMPTY = 5;
        const scrollDelay = this.configService.get<number>(
          'SCRAPING_SCROLL_DELAY',
          2000,
        );

        while (collected.length < limit && scrollAttempts < maxScrollAttempts) {
          const countBefore = collected.length;
          const tweetElements = await page.$$(TWITTER_SELECTORS.TWEET.ARTICLE);

          this.logger.debug(
            `Scroll #${scrollAttempts}: ${tweetElements.length} tweet elements found (collected so far: ${collected.length})`,
          );

          for (const element of tweetElements) {
            if (collected.length >= limit) break;
            try {
              const rawTweetData = await this.extractTweetData(page, element);
              const tweetData = await this.processTweetWithAuthor(rawTweetData);

              // O(1) duplicate check via Set instead of O(n) Array.find()
              if (tweetData.tweetId && !seenIds.has(tweetData.tweetId)) {
                seenIds.add(tweetData.tweetId);
                collected.push(tweetData);
              }
            } catch (err) {
              this.logger.warn('Failed to extract tweet data', err);
            }
          }

          // Declare feed exhausted only after MAX_CONSECUTIVE_EMPTY scrolls with
          // no new unique tweets — tolerates X.com virtual DOM viewport overlap.
          if (collected.length === countBefore) {
            consecutiveEmpty++;
            this.logger.debug(
              `Scroll #${scrollAttempts}: no new tweets (${consecutiveEmpty}/${MAX_CONSECUTIVE_EMPTY} consecutive empty scrolls)`,
            );
            if (consecutiveEmpty >= MAX_CONSECUTIVE_EMPTY) {
              this.logger.log(
                `Feed exhausted after ${scrollAttempts} scrolls. Collected ${collected.length}/${limit} tweets.`,
              );
              break;
            }
          } else {
            consecutiveEmpty = 0;
          }

          // Scroll to the bottom of the currently rendered content so X.com's
          // virtual scroller triggers loading the next batch of tweets.
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
    try {
      const cachedTweet = await this.tweetRepository.findById(tweetId);
      if (cachedTweet) {
        this.logger.log(`Tweet ${tweetId} found in database`);
        return cachedTweet;
      }

      await this.ensureAuthenticated();

      this.logger.log(`Scraping tweet ${tweetId} from Twitter`);
      const tweetUrl = `https://x.com/i/status/${tweetId}`;

      const tweetData = await this.runWithPage(tweetUrl, async (page) => {
        await page.locator(TWITTER_SELECTORS.TWEET.ARTICLE).first().waitFor();

        const tweetElement = await page.$(TWITTER_SELECTORS.TWEET.ARTICLE);
        if (!tweetElement) throw new Error('Tweet not found');

        const rawTweetData = await this.extractTweetData(page, tweetElement);
        return this.processTweetWithAuthor(rawTweetData);
      });

      await this.tweetRepository.create(tweetData);
      return tweetData;
    } catch (error) {
      this.logger.error(`Error getting tweet ${tweetId}`, error);
      throw error;
    }
  }

  async getUserProfile(username: string): Promise<any> {
    this.logger.log(`Getting profile for @${username}`);
    await this.ensureAuthenticated();

    try {
      const page = this.browserService.getPage();

      // Set up response interception BEFORE navigation to capture the
      // internal GraphQL call to UserByScreenName which contains rest_id.
      const userByScreenNamePromise = page.waitForResponse(
        (response) =>
          response.url().includes('UserByScreenName') &&
          response.status() === 200,
        { timeout: 15000 },
      );

      // Navigate to profile page
      await page.goto(`https://x.com/${username}`, {
        waitUntil: 'domcontentloaded',
      });

      // Await the intercepted UserByScreenName response and extract rest_id
      let restId = '';
      try {
        const apiResponse = await userByScreenNamePromise;
        const json = await apiResponse.json();
        restId = json?.data?.user?.result?.rest_id || '';
        this.logger.log(`Extracted rest_id for @${username}: ${restId}`);
      } catch (e) {
        this.logger.warn(
          `Failed to intercept UserByScreenName response for @${username}`,
          e,
        );
      }

      // Wait for profile DOM to load
      await page.locator(TWITTER_SELECTORS.PROFILE.USERNAME).waitFor();

      // Extract basic profile data from the DOM
      const basicData = await page.evaluate((selectors) => {
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

        // UserName element contains both displayName and @handle
        // Structure: <div data-testid="UserName"> contains two child divs:
        //   - First div: display name (may include verified badge SVG)
        //   - Second div: @handle
        const userNameEl = document.querySelector(selectors.PROFILE.USERNAME);
        let displayName = '';
        let handle = '';
        if (userNameEl) {
          // Get the full text content which includes "DisplayName@handle"
          const fullText = userNameEl.textContent?.trim() || '';

          // Extract @handle from spans
          const spans = userNameEl.querySelectorAll('span');
          for (const span of Array.from(spans)) {
            const text = span.textContent?.trim() || '';
            if (text.startsWith('@')) {
              handle = text.replace('@', '');
              break;
            }
          }

          // Display name is the full text minus the @handle part
          if (handle && fullText.includes(`@${handle}`)) {
            displayName = fullText.replace(`@${handle}`, '').trim();
          } else {
            // Fallback: try to get text from the first child div
            const firstChildDiv = userNameEl.querySelector('div');
            if (firstChildDiv) {
              displayName = firstChildDiv.textContent?.trim() || '';
            }
          }
        }

        const bio = getText(selectors.PROFILE.BIO);
        const location = getText(selectors.PROFILE.LOCATION);
        const joinDate = getText(selectors.PROFILE.JOIN_DATE);
        const followersText = getText(selectors.PROFILE.FOLLOWERS);
        const followingText = getText(selectors.PROFILE.FOLLOWING);

        // Check if the account is verified
        const verified = !!document.querySelector(selectors.PROFILE.VERIFIED);

        return {
          displayName,
          username: handle,
          bio,
          location,
          joinDate,
          followers: getNumber(followersText),
          following: getNumber(followingText),
          verified,
        };
      }, TWITTER_SELECTORS);

      // Navigate to the about page to get account info
      let accountInfo: string[] = [];
      try {
        await page.goto(`https://x.com/${username}/about`, {
          waitUntil: 'domcontentloaded',
        });
        await page.waitForSelector(TWITTER_SELECTORS.PROFILE.ABOUT_ITEM, {
          timeout: 5000,
        });

        // Each info item is a div with role="tab" and data-testid="pivot"
        // Use innerText instead of textContent to preserve spacing between nested elements
        accountInfo = await page.evaluate((selector) => {
          const items = document.querySelectorAll(selector);
          return Array.from(items)
            .map((item) =>
              (item as HTMLElement).innerText?.trim()
                ? (item as HTMLElement).innerText
                    .trim()
                    .replace(/\s?\n\s?/g, ': ')
                : '',
            )
            .filter(Boolean);
        }, TWITTER_SELECTORS.PROFILE.ABOUT_ITEM);
      } catch (e) {
        // About page scraping is best-effort; ignore errors
      }

      // Navigate to /{username}/photo to get the profile image URL
      let profileImageUrl = '';
      try {
        await page.goto(`https://x.com/${username}/photo`, {
          waitUntil: 'domcontentloaded',
        });
        await page.waitForSelector(TWITTER_SELECTORS.PROFILE.IMAGES, {
          timeout: 5000,
        });
        profileImageUrl = await page.evaluate((selector) => {
          const img = document.querySelector(selector) as HTMLImageElement;
          return img?.src || '';
        }, TWITTER_SELECTORS.PROFILE.IMAGES);
      } catch (e) {
        // Profile image scraping is best-effort; ignore errors
      }

      // Navigate to /{username}/header_photo to get the header image URL
      let headerImageUrl = '';
      try {
        await page.goto(`https://x.com/${username}/header_photo`, {
          waitUntil: 'domcontentloaded',
        });
        await page.waitForSelector(TWITTER_SELECTORS.PROFILE.BANNERS, {
          timeout: 5000,
        });
        headerImageUrl = await page.evaluate((selector) => {
          const img = document.querySelector(selector) as HTMLImageElement;
          return img?.src || '';
        }, TWITTER_SELECTORS.PROFILE.BANNERS);
      } catch (e) {
        // Header image scraping is best-effort; ignore errors
      }

      const profileData = {
        ...basicData,
        restId,
        profileImageUrl,
        headerImageUrl,
        accountInfo,
      };

      // Save/update profile in database
      await this.xUserRepository.upsert(profileData);

      this.logger.log(`Profile for @${username} saved to database`);
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
      const toQuery = filters.toAccounts.map((acc) => `to:${acc}`).join(' OR ');
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

          if (video) {
            const source = video.querySelector('source');
            return {
              type: 'video',
              url: source?.src,
              thumbnailUrl: video.poster,
            };
          }

          if (img)
            return { type: 'image', url: img.src, thumbnailUrl: img.src };

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
      const socialContextElement = el.querySelector(
        selectors.TWEET.SOCIAL_CONTEXT,
      );
      const ariaLabelledby = el.querySelector(selectors.TWEET.ARIA_LABELLEDBY);

      if (
        socialContextElement &&
        (socialContextElement.textContent.toLowerCase().includes('pinned') ||
          socialContextElement.textContent.toLowerCase().includes('fijado'))
      ) {
        tweetType = 'pinned';
      } else if (
        socialContextElement &&
        (socialContextElement.textContent.toLowerCase().includes('reposted') ||
          socialContextElement.textContent
            .toLowerCase()
            .includes('retweeted') ||
          socialContextElement.textContent.toLowerCase().includes('reposteó'))
      ) {
        tweetType = 'retweet';
      } else if (
        ariaLabelledby &&
        ariaLabelledby.querySelector(selectors.TWEET.USER_AVATAR)
      ) {
        tweetType = 'quote';
      }

      return {
        tweetId,
        text,
        authorData: {
          username: authorUsername,
          displayName: authorDisplayName,
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

  /**
   * Upsert the author from extracted tweet data as an XUser and return
   * the tweet data with `author` set to the XUser's ObjectId.
   */
  private async processTweetWithAuthor(rawTweetData: any): Promise<any> {
    const { authorData, ...tweetFields } = rawTweetData;

    // Upsert the author as an XUser (create if not exists, update displayName/verified)
    const xUser = await this.xUserRepository.upsert({
      username: authorData.username,
      displayName: authorData.displayName,
      verified: authorData.verified,
    });

    return {
      ...tweetFields,
      author: (xUser as any)._id,
    };
  }
}
