import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Page } from 'playwright';
import { PlaywrightBrowserService } from './playwright-browser.service';
import { TwitterScraperService } from './twitter-scraper.service';
import { TrendingTopicRepository } from '../repositories/trending-topic.repository';
import { TweetRepository } from '../repositories/tweet.repository';
import { XUserRepository } from '../repositories/x-user.repository';
import { TWITTER_SELECTORS } from '../constants/twitter-selectors.constants';
import { ScrapingThrottle } from '../utils/scraping-throttle.util';

const GLOBAL_TRENDING_URL = 'https://x.com/i/jf/global-trending/home';

@Injectable()
export class TrendingScraperService {
  private readonly logger = new Logger(TrendingScraperService.name);

  constructor(
    private readonly browserService: PlaywrightBrowserService,
    private readonly scraperService: TwitterScraperService,
    private readonly trendingTopicRepository: TrendingTopicRepository,
    private readonly tweetRepository: TweetRepository,
    private readonly xUserRepository: XUserRepository,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Scrape trending tweets for a given topic tag (e.g. "CRYPTOCURRENCY").
   *
   * Steps:
   *  1. Ensure the browser session is authenticated.
   *  2. Look up the TrendingTopic document to get the ES/EN labels.
   *  3. Navigate to the global trending page.
   *  4. Find and click the topic button matching the ES or EN label.
   *  5. Wait for tweet articles to appear.
   *  6. Extract and persist tweets into the tweets collection with isTrending=true.
   */
  async getTrendingTweetsByTopic(tag: string, limit = 20): Promise<any[]> {
    await this.scraperService.ensureAuthenticated();

    const topic = await this.trendingTopicRepository.findByTag(tag);
    if (!topic) {
      throw new NotFoundException(
        `Trending topic with tag "${tag}" not found. Run the trending-topics seed first.`,
      );
    }

    this.logger.log(
      `Scraping trending tweets for topic: ${topic.tag} (${topic.nameEn} / ${topic.nameEs}), limit: ${limit}`,
    );

    const page = this.browserService.getPage();

    try {
      await page.goto(GLOBAL_TRENDING_URL, { waitUntil: 'domcontentloaded' });

      // Wait for topic buttons to appear
      await page.waitForSelector(TWITTER_SELECTORS.TRENDING.TOPIC_BUTTON, {
        timeout: 15000,
      });

      // Find the button whose label matches nameEn or nameEs (case-insensitive)
      const clicked = await this.clickTopicButton(
        page,
        topic.nameEn,
        topic.nameEs,
      );

      if (!clicked) {
        await this.browserService.takeScreenshot(
          `trending-topic-not-found-${tag}`,
        );
        throw new Error(
          `Could not find topic button for "${topic.nameEn}" or "${topic.nameEs}" on the trending page.`,
        );
      }

      this.logger.log(`Clicked topic button for "${topic.nameEn}"`);

      // Wait for tweet articles to load after clicking the topic
      await page
        .waitForSelector(TWITTER_SELECTORS.TRENDING.TWEET_ARTICLE, {
          timeout: 15000,
        })
        .catch(() => {
          this.logger.warn(
            `No tweet articles found after clicking topic "${topic.nameEn}". The page may be empty.`,
          );
        });

      const scrollDelay = this.configService.get<number>(
        'SCRAPING_SCROLL_DELAY',
        2000,
      );

      // Extract tweets with scroll-and-collect loop
      const rawTweets = await this.extractTrendingTweets(
        page,
        limit,
        scrollDelay,
      );

      this.logger.log(
        `Extracted ${rawTweets.length} raw tweets for topic "${topic.tag}"`,
      );

      // Build date-only value for trendDate (midnight UTC of the current day)
      const now = new Date();
      const scrapedAt = now;
      const trendDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );

      // Process each tweet: upsert author and build Tweet payload with trending fields
      const trendingTweets: any[] = [];

      for (const rawTweet of rawTweets) {
        try {
          const { authorData, ...tweetFields } = rawTweet;

          const xUser = await this.xUserRepository.upsert({
            username: authorData.username,
            displayName: authorData.displayName,
            verified: authorData.verified,
          });

          trendingTweets.push({
            ...tweetFields,
            author: (xUser as any)._id,
            isTrending: true,
            trendingTopic: (topic as any)._id,
            scrapedAt,
            trendDate,
          });
        } catch (err) {
          this.logger.warn(
            `Failed to process tweet ${rawTweet.tweetId}: ${err?.message}`,
          );
        }
      }

      // Persist to MongoDB tweets collection
      await this.tweetRepository.bulkUpsert(trendingTweets);

      this.logger.log(
        `Saved ${trendingTweets.length} trending tweets for topic "${topic.tag}"`,
      );

      return trendingTweets;
    } catch (error) {
      this.logger.error(
        `Error scraping trending tweets for topic "${tag}": ${error?.message}`,
        error,
      );
      await this.browserService.takeScreenshot(`trending-error-${tag}`);
      throw error;
    }
  }

  /**
   * Find and click the topic button whose inner <p> text matches
   * either the English or Spanish label (case-insensitive).
   *
   * Returns true if a button was found and clicked, false otherwise.
   */
  private async clickTopicButton(
    page: Page,
    nameEn: string,
    nameEs: string,
  ): Promise<boolean> {
    const buttons = await page.$$(TWITTER_SELECTORS.TRENDING.TOPIC_BUTTON);

    for (const button of buttons) {
      try {
        const labelEl = await button.$(TWITTER_SELECTORS.TRENDING.TOPIC_LABEL);
        if (!labelEl) continue;

        const labelText = (await labelEl.textContent())?.trim() || '';
        const lower = labelText.toLowerCase();

        if (lower === nameEn.toLowerCase() || lower === nameEs.toLowerCase()) {
          await button.click();
          return true;
        }
      } catch (error) {
        this.logger.error(
          `Error clicking topic button: ${error?.message}`,
          error,
        );
      }
    }

    return false;
  }

  /**
   * Scroll-and-collect loop to extract tweet data from the trending page.
   * Reuses the same DOM extraction logic as the main scraper service via
   * the page's evaluate context.
   *
   * Exit conditions (whichever comes first):
   *  1. `collected.length >= limit` — requested number of tweets reached.
   *  2. A scroll yields no new unique tweets — the feed is exhausted.
   *
   * When `limit` > 50 a `ScrapingThrottle` is activated to insert randomised
   * human-like pauses between tweet extractions, reducing the risk of being
   * rate-limited or blocked by x.com.
   */
  private async extractTrendingTweets(
    page: Page,
    limit: number,
    scrollDelay: number,
  ): Promise<any[]> {
    const collected: any[] = [];
    // O(1) deduplication using a Set of tweet IDs (inspired by the Set-merge
    // pattern: [...new Set([...accumulated, ...current])]).
    const seenIds = new Set<string>();
    let scrollAttempts = 0;
    // Allow up to MAX_CONSECUTIVE_EMPTY scrolls with no new tweets before
    // declaring the feed exhausted. This tolerates viewport-overlap scrolls
    // where X.com's virtual DOM still shows already-collected tweets.
    let consecutiveEmpty = 0;
    const MAX_CONSECUTIVE_EMPTY = 5;

    // One throttle instance per scraping session; burstThreshold = limit so
    // pauses only kick in when we exceed the requested limit (i.e. large runs).
    const throttle = new ScrapingThrottle({ burstThreshold: limit });

    this.logger.debug(`Starting scroll loop: limit=${limit}`);

    while (collected.length < limit) {
      const countBefore = collected.length;

      const tweetElements = await page.$$(
        TWITTER_SELECTORS.TRENDING.TWEET_ARTICLE,
      );

      this.logger.debug(
        `Scroll #${scrollAttempts}: ${tweetElements.length} tweet elements found (collected so far: ${collected.length})`,
      );

      // Detect potential rate-limit signal: no elements found after the first scroll
      if (tweetElements.length === 0 && scrollAttempts > 0) {
        this.logger.warn(
          `No tweet elements found on scroll #${scrollAttempts}. Applying backoff...`,
        );
        const waited = await throttle.backoff();
        this.logger.log(`Backoff applied: ${waited}ms`);
      }

      for (const element of tweetElements) {
        if (collected.length >= limit) break;
        try {
          const rawTweetData = await this.extractTweetData(page, element);
          // O(1) duplicate check via Set instead of O(n) Array.find()
          if (rawTweetData.tweetId && !seenIds.has(rawTweetData.tweetId)) {
            seenIds.add(rawTweetData.tweetId);
            collected.push(rawTweetData);

            // Insert throttle delay after each new tweet when limit > 50
            await throttle.tick(collected.length);
          }
        } catch (err) {
          this.logger.warn(`Failed to extract tweet data: ${err?.message}`);
        }
      }

      // If this scroll yielded no new unique tweets, increment the consecutive
      // counter. Only declare the feed exhausted after MAX_CONSECUTIVE_EMPTY
      // consecutive empty scrolls — a single empty scroll can happen due to
      // X.com's virtual DOM viewport overlap and should not stop the loop.
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
      // Using scrollTo(0, scrollHeight) instead of scrollBy(0, innerHeight)
      // ensures we always reach the "load more" trigger point regardless of
      // how tall the rendered content is.
      await page.evaluate(() =>
        window.scrollTo(0, document.body.scrollHeight),
      );
      await page.waitForTimeout(scrollDelay);
      scrollAttempts++;
    }

    // Reset backoff so the next call starts fresh
    throttle.resetBackoff();

    return collected;
  }

  /**
   * Extract structured tweet data from a single tweet article element.
   * This mirrors the logic in TwitterScraperService.extractTweetData().
   */
  private async extractTweetData(page: Page, element: any): Promise<any> {
    // Expand "Show more" if present
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
    } catch {
      // Ignore
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

      // Tweet ID
      const tweetLink = el.querySelector('a[href*="/status/"]');
      const tweetId = tweetLink
        ? tweetLink.getAttribute('href')?.match(/status\/(\d+)/)?.[1] || ''
        : '';

      // Text
      const text = getText(selectors.TWEET.TEXT);

      // Author
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
      const hashtags = (text.match(/#\w+/g) || []).map((tag: string) =>
        tag.substring(1),
      );
      const mentions = (text.match(/@\w+/g) || []).map((mention: string) =>
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
      };
    }, TWITTER_SELECTORS);

    return tweetData;
  }
}
