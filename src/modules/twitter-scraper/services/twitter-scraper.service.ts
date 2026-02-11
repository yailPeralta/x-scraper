import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlaywrightBrowserService } from './playwright-browser.service';
import { TweetRepository } from '../repositories/tweet.repository';
import { TWITTER_SELECTORS } from '../constants/twitter-selectors.constants';
import { ElementHandle } from 'playwright';

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

    // Usar credenciales de env si no se proporcionan
    const twitterUsername =
      username || this.configService.get<string>('TWITTER_USERNAME');
    const twitterPassword =
      password || this.configService.get<string>('TWITTER_PASSWORD');

    if (!twitterUsername || !twitterPassword) {
      throw new Error('Twitter credentials not provided');
    }

    try {
      this.logger.log('Starting Twitter login process...');

      // Navegar a la página de login
      await page.goto('https://x.com/i/flow/login');

      // Esperar que el input username sea visible
      const usernameLocator = page.locator(TWITTER_SELECTORS.LOGIN.USERNAME_INPUT);
      await usernameLocator.waitFor();

      // Llenar el campo de username
      usernameLocator.fill(twitterUsername);
      page.click(TWITTER_SELECTORS.LOGIN.NEXT_BUTTON);

      // Esperar que el input password sea visible
      const passwordLocator = page.locator(TWITTER_SELECTORS.LOGIN.PASSWORD_INPUT);
      await passwordLocator.waitFor();

      passwordLocator.fill(twitterPassword);

      // Click en login
      await page.click(TWITTER_SELECTORS.LOGIN.LOGIN_BUTTON);

      // Esperar a que la navegación complete
      await page.waitForURL('**/home', { timeout: 15000 });

      this.logger.log('Login successful');
      this.browserService.setAuthenticated(true);

      // Guardar sesión para futuros usos
      await this.browserService.saveSession();

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

  async getTweetsByUsername(
    username: string,
    options: {
      limit?: number;
      includeReplies?: boolean;
      includeRetweets?: boolean;
    } = {},
  ): Promise<any[]> {
    await this.ensureAuthenticated();

    const page = this.browserService.getPage();
    const limit = options.limit || 10;
    const includeReplies = options.includeReplies ?? false;
    const includeRetweets = options.includeRetweets ?? true;

    this.logger.log(`Scraping tweets from @${username}, limit: ${limit}`);

    try {
      // Navegar al perfil del usuario
      const profileUrl = includeReplies
        ? `https://x.com/${username}/with_replies`
        : `https://x.com/${username}`;

      await page.goto(profileUrl);

      // Esperar a que los tweets carguen
      await page.locator(TWITTER_SELECTORS.TWEET.ARTICLE).first().waitFor();

      const tweets: any[] = [];
      let previousHeight = 0;
      let scrollAttempts = 0;
      const maxScrollAttempts = 50;

      while (tweets.length < limit && scrollAttempts < maxScrollAttempts) {
        // Obtener todos los artículos de tweets visibles
        const tweetElements = await page.$$(TWITTER_SELECTORS.TWEET.ARTICLE);

        console.log('TWEET ELEMENTS LENGTH\n', tweetElements.length);
        console.log('SCROLL ATTEMPTS\n', scrollAttempts);

        for (const element of tweetElements) {
          console.log(element.innerHTML);
          if (tweets.length >= limit) break;

          try {
            const tweetData = await this.extractTweetData(element);

            // Filtrar retweets si no se desean
            if (!includeRetweets && tweetData.tweetType === 'retweet') {
              continue;
            }

            // Evitar duplicados
            if (!tweets.find((t) => t.tweetId === tweetData.tweetId)) {
              tweets.push(tweetData);
            }
          } catch (error) {
            this.logger.warn('Failed to extract tweet data', error);
          }
        }

        // Scroll hacia abajo
        const currentHeight = await page.evaluate(
          () => document.body.scrollHeight,
        );

        if (currentHeight === previousHeight) {
          // No hay más contenido para cargar
          break;
        }

        previousHeight = currentHeight;
        await page.evaluate(() =>
          window.scrollTo(0, document.body.scrollHeight),
        );

        // Esperar a que carguen nuevos tweets
        const scrollDelay = this.configService.get<number>(
          'SCRAPING_SCROLL_DELAY',
          2000,
        );
        await page.waitForTimeout(scrollDelay);

        scrollAttempts++;
      }

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

    const page = this.browserService.getPage();
    const limit = options.limit || 50;
    const filters = options.filters || {};

    const query = this.buildSearchQuery(searchTerm, filters);

    this.logger.log(`Searching tweets for: "${query}", limit: ${limit}`);

    try {
      // Navegar a la búsqueda
      const searchUrl = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`;
      await page.goto(searchUrl);

      // Esperar a que los resultados carguen
      await page.locator(TWITTER_SELECTORS.TWEET.ARTICLE).first().waitFor();

      const tweets: any[] = [];
      let previousHeight = 0;
      let scrollAttempts = 0;
      const maxScrollAttempts = 50;

      while (tweets.length < limit && scrollAttempts < maxScrollAttempts) {
        const tweetElements = await page.$$(TWITTER_SELECTORS.TWEET.ARTICLE);

        console.log('TWEET ELEMENTS LENGTH\n', tweetElements.length);
        console.log('SCROLL ATTEMPTS\n', scrollAttempts);

        for (const element of tweetElements) {
          if (tweets.length >= limit) break;

          try {
            const tweetData = await this.extractTweetData(element);

            // Evitar duplicados
            if (!tweets.find((t) => t.tweetId === tweetData.tweetId)) {
              tweets.push(tweetData);
            }
          } catch (error) {
            this.logger.warn('Failed to extract tweet data', error);
          }
        }

        // Scroll hacia abajo
        const currentHeight = await page.evaluate(
          () => document.body.scrollHeight,
        );

        if (currentHeight === previousHeight) {
          break;
        }

        previousHeight = currentHeight;
        await page.evaluate(() =>
          window.scrollTo(0, document.body.scrollHeight),
        );

        const scrollDelay = this.configService.get<number>(
          'SCRAPING_SCROLL_DELAY',
          2000,
        );
        await page.waitForTimeout(scrollDelay);

        scrollAttempts++;
      }

      this.logger.log(
        `Found ${tweets.length} tweets for search: "${query}"`,
      );
      return tweets;
    } catch (error) {
      this.logger.error(`Error searching tweets for: "${query}"`, error);
      await this.browserService.takeScreenshot(`error-search-${searchTerm}`);
      throw error;
    }
  }

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
      const fromQuery = filters.fromAccounts.map((acc) => `from:${acc}`).join(' OR ');
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

    if (filters.minReplies) {
      query += ` min_replies:${filters.minReplies}`;
    }

    if (filters.minFaves) {
      query += ` min_faves:${filters.minFaves}`;
    }

    if (filters.minRetweets) {
      query += ` min_retweets:${filters.minRetweets}`;
    }

    if (filters.until) {
      query += ` until:${filters.until}`;
    }

    if (filters.since) {
      query += ` since:${filters.since}`;
    }

    return query.trim();
  }

  private async extractTweetData(element: ElementHandle): Promise<any> {
    // Ver si hay botón "Show more" y expandirlo
    try {
      const showMoreButton = await element.$(
        TWITTER_SELECTORS.TWEET.SHOW_MORE_BUTTON,
      );
      if (showMoreButton) {
        const href = await showMoreButton.getAttribute('href');
        // Solo hacer click si no tiene href o es vacío/hash
        if (!href || href === '#' || href === '') {
          await showMoreButton.click();
          // Pequeña espera para que se expanda el texto
          await this.browserService.getPage().waitForTimeout(500);
        }
      }
    } catch (e) {
      console.log(e.message);
      // Ignorar errores al intentar expandir
    }

    // Extraer datos del tweet usando selectores
    const tweetData = await element.evaluate((el: Element, selectors: any) => {
      const getText = (selector: string) => {
        const elem = el.querySelector(selector);
        return elem ? elem.textContent.trim() : '';
      };

      const getAttribute = (selector: string, attr: string) => {
        const elem = el.querySelector(selector);
        return elem ? elem.getAttribute(attr) : '';
      };

      const getNumber = (selector: string) => {
        const text = getText(selector);
        if (!text) return 0;

        const cleanText = text.replace(/\s+/g, ' ').trim().toLowerCase();
        let multiplier = 1;

        if (cleanText.includes('k')) {
          multiplier = 1000;
        } else if (cleanText.includes('mil')) {
          multiplier = 1000;
        } else if (cleanText.includes('m')) {
          multiplier = 1000000;
        } else if (cleanText.includes('b')) {
          multiplier = 1000000000;
        }

        const match = cleanText.match(/[\d,.]+/);
        if (!match) return 0;

        let numStr = match[0];

        if (multiplier > 1) {
          numStr = numStr.replace(',', '.');
          return Math.floor(parseFloat(numStr) * multiplier);
        }

        return parseInt(numStr.replace(/[,.]/g, ''), 10);
      };

      // Extraer ID del tweet desde el link
      const tweetLink = el.querySelector('a[href*="/status/"]');
      const tweetId = tweetLink
        ? tweetLink.getAttribute('href')?.match(/status\/(\d+)/)?.[1] || ''
        : '';

      console.log('TWEET ID\n', tweetId);

      // Extraer texto del tweet
      const text = getText(selectors.TWEET.TEXT);

      // Extraer información del autor
      const authorElement = el.querySelector(selectors.TWEET.AUTHOR_NAME);
      const authorUsername = authorElement
        ? authorElement.querySelector('a').getAttribute('href').replace('/', '')
        : '';
      const authorDisplayName = authorElement
        ? authorElement.querySelector('a')?.textContent?.trim() || ''
        : '';

      // Extraer timestamp
      const timeElement = el.querySelector(selectors.TWEET.TIMESTAMP);
      const timestamp = timeElement ? timeElement.getAttribute('datetime') : '';

      // Extraer métricas
      const likes = getNumber(selectors.TWEET.LIKE_COUNT);
      const retweets = getNumber(selectors.TWEET.RETWEET_COUNT);
      const replies = getNumber(selectors.TWEET.REPLY_COUNT);
      const views = getNumber(selectors.TWEET.VIEW_COUNT);

      // Extraer media
      const mediaElements = el.querySelectorAll(selectors.TWEET.MEDIA);
      const media = Array.from(mediaElements)
        .map((mediaEl: any) => {
          const img = mediaEl.querySelector('img');
          const video = mediaEl.querySelector('video');

          if (img) {
            return {
              type: 'image',
              url: img.src,
              thumbnailUrl: img.src,
            };
          } else if (video) {
            return {
              type: 'video',
              url: video.src,
              thumbnailUrl: video.poster,
            };
          }
          return null;
        })
        .filter(Boolean);

      // Extraer hashtags y menciones del texto
      const hashtags = (text.match(/#\w+/g) || []).map((tag) =>
        tag.substring(1),
      );
      const mentions = (text.match(/@\w+/g) || []).map((mention) =>
        mention.substring(1),
      );

      // Determinar tipo de tweet
      let tweetType = 'original';
      if (el.textContent?.includes('Retweeted')) {
        tweetType = 'retweet';
      } else if (el.querySelector('[data-testid="reply"]')) {
        tweetType = 'reply';
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
        createdAt: timestamp,
        metrics: {
          likes,
          retweets,
          replies,
          views,
          bookmarks: 0,
        },
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

  async getTweetById(tweetId: string): Promise<any> {
    await this.ensureAuthenticated();

    const page = this.browserService.getPage();

    try {
      // Buscar primero en la base de datos
      const cachedTweet = await this.tweetRepository.findById(tweetId);
      if (cachedTweet) {
        this.logger.log(`Tweet ${tweetId} found in database`);
        return cachedTweet;
      }

      // Si no está en la BD, scrapear
      this.logger.log(`Scraping tweet ${tweetId} from Twitter`);
      const tweetUrl = `https://x.com/i/status/${tweetId}`;
      await page.goto(tweetUrl);

      await page.locator(TWITTER_SELECTORS.TWEET.ARTICLE).first().waitFor();

      const tweetElement = await page.$(TWITTER_SELECTORS.TWEET.ARTICLE);
      if (!tweetElement) {
        throw new Error('Tweet not found');
      }

      const tweetData = await this.extractTweetData(tweetElement);

      // Guardar en la base de datos
      await this.tweetRepository.create(tweetData);

      return tweetData;
    } catch (error) {
      this.logger.error(`Error getting tweet ${tweetId}`, error);
      throw error;
    }
  }

  async getUserProfile(username: string): Promise<any> {
    await this.ensureAuthenticated();

    const page = this.browserService.getPage();

    try {
      this.logger.log(`Getting profile for @${username}`);
      await page.goto(`https://x.com/${username}`, {
        waitUntil: 'networkidle',
      });

      await page.locator(TWITTER_SELECTORS.PROFILE.USERNAME).waitFor();

      const profileData = await page.evaluate((selectors) => {
        const getText = (selector: string) => {
          const elem = document.querySelector(selector);
          return elem ? elem.textContent.trim() : '';
        };

        const getNumber = (text: string) => {
          if (!text) return 0;

          const cleanText = text.replace(/\s+/g, ' ').trim().toLowerCase();
          let multiplier = 1;

          if (cleanText.includes('k')) {
            multiplier = 1000;
          } else if (cleanText.includes('mil')) {
            multiplier = 1000;
          } else if (cleanText.includes('m')) {
            multiplier = 1000000;
          } else if (cleanText.includes('b')) {
            multiplier = 1000000000;
          }

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

      return profileData;
    } catch (error) {
      this.logger.error(`Error getting profile for @${username}`, error);
      throw error;
    }
  }
}
