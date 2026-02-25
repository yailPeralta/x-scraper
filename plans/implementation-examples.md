# Ejemplos de Implementación - Twitter Scraper

## 1. Tweet Schema (Mongoose)

```typescript
// src/modules/twitter-scraper/schemas/tweet.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TweetDocument = Tweet & Document;

@Schema({ timestamps: true })
export class TweetAuthor {
  @Prop({ required: true })
  username: string;

  @Prop({ required: true })
  displayName: string;

  @Prop({ required: true })
  userId: string;

  @Prop()
  profileImageUrl: string;

  @Prop({ default: false })
  verified: boolean;
}

@Schema()
export class TweetMetrics {
  @Prop({ default: 0 })
  likes: number;

  @Prop({ default: 0 })
  retweets: number;

  @Prop({ default: 0 })
  replies: number;

  @Prop({ default: 0 })
  views: number;

  @Prop({ default: 0 })
  bookmarks: number;
}

@Schema()
export class TweetMedia {
  @Prop({ required: true, enum: ['image', 'video', 'gif'] })
  type: string;

  @Prop({ required: true })
  url: string;

  @Prop()
  thumbnailUrl: string;
}

@Schema({ timestamps: true })
export class Tweet {
  @Prop({ required: true, unique: true, index: true })
  tweetId: string;

  @Prop({ required: true })
  text: string;

  @Prop({ type: TweetAuthor, required: true })
  author: TweetAuthor;

  @Prop({ required: true, index: true })
  createdAt: Date;

  @Prop({ type: TweetMetrics })
  metrics: TweetMetrics;

  @Prop({ type: [TweetMedia] })
  media: TweetMedia[];

  @Prop({ type: [String], index: true })
  hashtags: string[];

  @Prop({ type: [String] })
  mentions: string[];

  @Prop({ type: [String] })
  urls: string[];

  @Prop()
  location: string;

  @Prop({ 
    required: true, 
    enum: ['original', 'retweet', 'reply', 'quote'],
    index: true 
  })
  tweetType: string;

  @Prop()
  inReplyToTweetId: string;

  @Prop()
  quotedTweetId: string;

  @Prop()
  retweetedTweetId: string;

  @Prop()
  language: string;

  @Prop({ default: false })
  isThread: boolean;

  @Prop()
  threadPosition: number;
}

export const TweetSchema = SchemaFactory.createForClass(Tweet);

// Índices compuestos para búsquedas eficientes
TweetSchema.index({ 'author.username': 1, createdAt: -1 });
TweetSchema.index({ hashtags: 1, createdAt: -1 });
TweetSchema.index({ tweetType: 1, createdAt: -1 });
```

## 2. PlaywrightBrowserService

```typescript
// src/modules/twitter-scraper/services/playwright-browser.service.ts
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class PlaywrightBrowserService implements OnModuleDestroy {
  private readonly logger = new Logger(PlaywrightBrowserService.name);
  private browser: Browser;
  private context: BrowserContext;
  private page: Page;
  private isAuthenticated = false;
  private sessionPath: string;

  constructor(private configService: ConfigService) {
    this.sessionPath = this.configService.get<string>(
      'PLAYWRIGHT_SESSION_PATH',
      './sessions/twitter-session.json',
    );
  }

  async initBrowser(): Promise<void> {
    if (this.browser) {
      this.logger.log('Browser already initialized');
      return;
    }

    this.logger.log('Initializing Playwright browser...');

    const headless = this.configService.get<boolean>('PLAYWRIGHT_HEADLESS', true);
    const slowMo = this.configService.get<number>('PLAYWRIGHT_SLOW_MO', 100);

    this.browser = await chromium.launch({
      headless,
      slowMo,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-US',
    });

    // Intentar cargar sesión guardada
    await this.loadSession();

    this.page = await this.context.newPage();
    
    // Configurar timeout global
    const timeout = this.configService.get<number>('PLAYWRIGHT_TIMEOUT', 30000);
    this.page.setDefaultTimeout(timeout);

    this.logger.log('Browser initialized successfully');
  }

  async closeBrowser(): Promise<void> {
    if (this.page) {
      await this.page.close();
    }
    if (this.context) {
      await this.context.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
    this.browser = null;
    this.context = null;
    this.page = null;
    this.isAuthenticated = false;
    this.logger.log('Browser closed');
  }

  getPage(): Page {
    if (!this.page) {
      throw new Error('Browser not initialized. Call initBrowser() first.');
    }
    return this.page;
  }

  async saveSession(): Promise<void> {
    if (!this.context) {
      throw new Error('No browser context to save');
    }

    const cookies = await this.context.cookies();
    const localStorage = await this.page.evaluate(() => {
      return JSON.stringify(window.localStorage);
    });

    const sessionData = {
      cookies,
      localStorage: JSON.parse(localStorage),
      timestamp: new Date().toISOString(),
    };

    const dir = path.dirname(this.sessionPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.sessionPath, JSON.stringify(sessionData, null, 2));

    this.logger.log(`Session saved to ${this.sessionPath}`);
  }

  async loadSession(): Promise<boolean> {
    try {
      const sessionData = await fs.readFile(this.sessionPath, 'utf-8');
      const { cookies, localStorage } = JSON.parse(sessionData);

      if (cookies && cookies.length > 0) {
        await this.context.addCookies(cookies);
        this.logger.log('Session cookies loaded');
      }

      if (this.page && localStorage) {
        await this.page.addInitScript((storage) => {
          Object.entries(storage).forEach(([key, value]) => {
            window.localStorage.setItem(key, value as string);
          });
        }, localStorage);
        this.logger.log('Session localStorage loaded');
      }

      return true;
    } catch (error) {
      this.logger.warn('No saved session found or failed to load');
      return false;
    }
  }

  async isSessionActive(): Promise<boolean> {
    if (!this.page) {
      return false;
    }

    try {
      await this.page.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
      await this.page.waitForTimeout(2000);

      // Verificar si estamos en la página de login o en home
      const url = this.page.url();
      this.isAuthenticated = url.includes('/home') && !url.includes('/login');
      
      return this.isAuthenticated;
    } catch (error) {
      this.logger.error('Error checking session status', error);
      return false;
    }
  }

  async takeScreenshot(name: string): Promise<string> {
    const screenshotPath = `./screenshots/${name}-${Date.now()}.png`;
    await fs.mkdir('./screenshots', { recursive: true });
    await this.page.screenshot({ path: screenshotPath, fullPage: true });
    this.logger.log(`Screenshot saved: ${screenshotPath}`);
    return screenshotPath;
  }

  setAuthenticated(value: boolean): void {
    this.isAuthenticated = value;
  }

  getIsAuthenticated(): boolean {
    return this.isAuthenticated;
  }

  async onModuleDestroy() {
    await this.closeBrowser();
  }
}
```

## 3. TwitterScraperService - Login

```typescript
// src/modules/twitter-scraper/services/twitter-scraper.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlaywrightBrowserService } from './playwright-browser.service';
import { TWITTER_SELECTORS } from '../constants/twitter-selectors.constants';

@Injectable()
export class TwitterScraperService {
  private readonly logger = new Logger(TwitterScraperService.name);

  constructor(
    private browserService: PlaywrightBrowserService,
    private configService: ConfigService,
  ) {}

  async login(username?: string, password?: string): Promise<boolean> {
    const page = this.browserService.getPage();
    
    // Usar credenciales de env si no se proporcionan
    const twitterUsername = username || this.configService.get<string>('TWITTER_USERNAME');
    const twitterPassword = password || this.configService.get<string>('TWITTER_PASSWORD');

    if (!twitterUsername || !twitterPassword) {
      throw new Error('Twitter credentials not provided');
    }

    try {
      this.logger.log('Starting Twitter login process...');

      // Navegar a la página de login
      await page.goto('https://x.com/i/flow/login', { 
        waitUntil: 'networkidle' 
      });

      // Esperar y llenar el campo de usuario
      await page.waitForSelector(TWITTER_SELECTORS.LOGIN.USERNAME_INPUT, {
        timeout: 10000,
      });
      await page.fill(TWITTER_SELECTORS.LOGIN.USERNAME_INPUT, twitterUsername);
      await page.click(TWITTER_SELECTORS.LOGIN.NEXT_BUTTON);

      // Esperar y llenar el campo de contraseña
      await page.waitForSelector(TWITTER_SELECTORS.LOGIN.PASSWORD_INPUT, {
        timeout: 10000,
      });
      await page.fill(TWITTER_SELECTORS.LOGIN.PASSWORD_INPUT, twitterPassword);
      
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
}
```

## 4. TwitterScraperService - getTweetsByUsername

```typescript
// Continuación de twitter-scraper.service.ts

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
  const limit = options.limit || 50;
  const includeReplies = options.includeReplies ?? false;
  const includeRetweets = options.includeRetweets ?? true;

  this.logger.log(`Scraping tweets from @${username}, limit: ${limit}`);

  try {
    // Navegar al perfil del usuario
    const profileUrl = includeReplies 
      ? `https://x.com/${username}/with_replies`
      : `https://x.com/${username}`;
    
    await page.goto(profileUrl, { waitUntil: 'networkidle' });

    // Esperar a que los tweets carguen
    await page.waitForSelector(TWITTER_SELECTORS.TWEET.ARTICLE, {
      timeout: 10000,
    });

    const tweets = [];
    let previousHeight = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 50;

    while (tweets.length < limit && scrollAttempts < maxScrollAttempts) {
      // Obtener todos los artículos de tweets visibles
      const tweetElements = await page.$$(TWITTER_SELECTORS.TWEET.ARTICLE);

      for (const element of tweetElements) {
        if (tweets.length >= limit) break;

        try {
          const tweetData = await this.extractTweetData(element);
          
          // Filtrar retweets si no se desean
          if (!includeRetweets && tweetData.tweetType === 'retweet') {
            continue;
          }

          // Evitar duplicados
          if (!tweets.find(t => t.tweetId === tweetData.tweetId)) {
            tweets.push(tweetData);
          }
        } catch (error) {
          this.logger.warn('Failed to extract tweet data', error);
        }
      }

      // Scroll hacia abajo
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      
      if (currentHeight === previousHeight) {
        // No hay más contenido para cargar
        break;
      }

      previousHeight = currentHeight;
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      
      // Esperar a que carguen nuevos tweets
      const scrollDelay = this.configService.get<number>('SCRAPING_SCROLL_DELAY', 2000);
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

private async extractTweetData(element: any): Promise<any> {
  const page = this.browserService.getPage();

  // Extraer datos del tweet usando selectores
  const tweetData = await element.evaluate((el, selectors) => {
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
      const match = text.match(/[\d,]+/);
      return match ? parseInt(match[0].replace(/,/g, ''), 10) : 0;
    };

    // Extraer ID del tweet desde el link
    const tweetLink = el.querySelector('a[href*="/status/"]');
    const tweetId = tweetLink 
      ? tweetLink.getAttribute('href').match(/status\/(\d+)/)?.[1] 
      : '';

    // Extraer texto del tweet
    const text = getText(selectors.TWEET.TEXT);

    // Extraer información del autor
    const authorElement = el.querySelector(selectors.TWEET.AUTHOR_NAME);
    const authorUsername = authorElement 
      ? authorElement.querySelector('a').getAttribute('href').replace('/', '') 
      : '';
    const authorDisplayName = getText(selectors.TWEET.AUTHOR_NAME);

    // Extraer timestamp
    const timeElement = el.querySelector(selectors.TWEET.TIMESTAMP);
    const timestamp = timeElement ? timeElement.getAttribute('datetime') : '';

    // Extraer métricas
    const likes = getNumber(selectors.TWEET.LIKE_COUNT);
    const retweets = getNumber(selectors.TWEET.RETWEET_COUNT);
    const replies = getNumber(selectors.TWEET.REPLY_COUNT);

    // Extraer media
    const mediaElements = el.querySelectorAll(selectors.TWEET.MEDIA);
    const media = Array.from(mediaElements).map((mediaEl: any) => {
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
    }).filter(Boolean);

    // Extraer hashtags y menciones del texto
    const hashtags = (text.match(/#\w+/g) || []).map(tag => tag.substring(1));
    const mentions = (text.match(/@\w+/g) || []).map(mention => mention.substring(1));

    // Determinar tipo de tweet
    let tweetType = 'original';
    if (el.textContent.includes('Retweeted')) {
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
        userId: '', // Se puede extraer de la API o del perfil
        profileImageUrl: '',
        verified: !!el.querySelector('[data-testid="icon-verified"]'),
      },
      createdAt: timestamp,
      metrics: {
        likes,
        retweets,
        replies,
        views: 0,
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
```

## 5. TwitterScraperController

```typescript
// src/modules/twitter-scraper/controllers/twitter-scraper.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TwitterScraperService } from '../services/twitter-scraper.service';
import { TweetRepository } from '../repositories/tweet.repository';
import { GetTweetsByUsernameDto } from '../dto/get-tweets-by-username.dto';
import { SearchTweetsDto } from '../dto/search-tweets.dto';
import { LoginDto } from '../dto/login.dto';

@Controller('api/twitter')
export class TwitterScraperController {
  constructor(
    private readonly scraperService: TwitterScraperService,
    private readonly tweetRepository: TweetRepository,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    const success = await this.scraperService.login(
      loginDto.username,
      loginDto.password,
    );
    return { success, message: 'Login successful' };
  }

  @Get('tweets/username/:username')
  async getTweetsByUsername(
    @Param('username') username: string,
    @Query() query: GetTweetsByUsernameDto,
  ) {
    const tweets = await this.scraperService.getTweetsByUsername(username, {
      limit: query.limit,
      includeReplies: query.includeReplies,
      includeRetweets: query.includeRetweets,
    });

    // Guardar en base de datos
    await this.tweetRepository.bulkUpsert(tweets);

    return {
      username,
      count: tweets.length,
      tweets,
    };
  }

  @Post('tweets/search')
  async searchTweets(@Body() searchDto: SearchTweetsDto) {
    const tweets = await this.scraperService.getTweetsFromSearchTerm(
      searchDto.searchTerm,
      {
        limit: searchDto.limit,
        filters: searchDto.filters,
      },
    );

    await this.tweetRepository.bulkUpsert(tweets);

    return {
      searchTerm: searchDto.searchTerm,
      count: tweets.length,
      tweets,
    };
  }

  @Get('stored/tweets')
  async getStoredTweets(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('username') username?: string,
  ) {
    const options = {
      skip: (page - 1) * limit,
      limit,
    };

    const tweets = username
      ? await this.tweetRepository.findByUsername(username, options)
      : await this.tweetRepository.findAll(options);

    return {
      page,
      limit,
      count: tweets.length,
      tweets,
    };
  }

  @Get('stored/stats')
  async getStats() {
    return await this.tweetRepository.getStats();
  }
}
```

## 6. DTOs

```typescript
// src/modules/twitter-scraper/dto/get-tweets-by-username.dto.ts
import { IsOptional, IsNumber, IsBoolean, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class GetTweetsByUsernameDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(500)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeReplies?: boolean = false;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeRetweets?: boolean = true;
}

// src/modules/twitter-scraper/dto/search-tweets.dto.ts
import { IsString, IsOptional, IsNumber, Min, Max, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

export class SearchTweetsDto {
  @IsString()
  searchTerm: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(500)
  limit?: number = 50;

  @IsOptional()
  @IsObject()
  filters?: {
    fromDate?: string;
    toDate?: string;
    language?: string;
    verified?: boolean;
  };
}

// src/modules/twitter-scraper/dto/login.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
```

## 7. TweetRepository

```typescript
// src/modules/twitter-scraper/repositories/tweet.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tweet, TweetDocument } from '../schemas/tweet.schema';

@Injectable()
export class TweetRepository {
  constructor(
    @InjectModel(Tweet.name) private tweetModel: Model<TweetDocument>,
  ) {}

  async create(tweetData: Partial<Tweet>): Promise<Tweet> {
    const tweet = new this.tweetModel(tweetData);
    return tweet.save();
  }

  async findById(tweetId: string): Promise<Tweet> {
    return this.tweetModel.findOne({ tweetId }).exec();
  }

  async findByUsername(
    username: string,
    options: { skip?: number; limit?: number } = {},
  ): Promise<Tweet[]> {
    return this.tweetModel
      .find({ 'author.username': username })
      .sort({ createdAt: -1 })
      .skip(options.skip || 0)
      .limit(options.limit || 20)
      .exec();
  }

  async findAll(options: { skip?: number; limit?: number } = {}): Promise<Tweet[]> {
    return this.tweetModel
      .find()
      .sort({ createdAt: -1 })
      .skip(options.skip || 0)
      .limit(options.limit || 20)
      .exec();
  }

  async bulkUpsert(tweets: Partial<Tweet>[]): Promise<number> {
    const operations = tweets.map((tweet) => ({
      updateOne: {
        filter: { tweetId: tweet.tweetId },
        update: { $set: tweet },
        upsert: true,
      },
    }));

    const result = await this.tweetModel.bulkWrite(operations);
    return result.upsertedCount + result.modifiedCount;
  }

  async delete(tweetId: string): Promise<boolean> {
    const result = await this.tweetModel.deleteOne({ tweetId }).exec();
    return result.deletedCount > 0;
  }

  async getStats(): Promise<any> {
    const totalTweets = await this.tweetModel.countDocuments().exec();
    const uniqueUsers = await this.tweetModel.distinct('author.username').exec();
    
    const tweetsByType = await this.tweetModel.aggregate([
      {
        $group: {
          _id: '$tweetType',
          count: { $sum: 1 },
        },
      },
    ]);

    const topHashtags = await this.tweetModel.aggregate([
      { $unwind: '$hashtags' },
      {
        $group: {
          _id: '$hashtags',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    return {
      totalTweets,
      uniqueUsers: uniqueUsers.length,
      tweetsByType,
      topHashtags,
    };
  }
}
```

## 8. Twitter Selectors Constants

```typescript
// src/modules/twitter-scraper/constants/twitter-selectors.constants.ts
export const TWITTER_SELECTORS = {
  LOGIN: {
    USERNAME_INPUT: 'input[autocomplete="username"]',
    PASSWORD_INPUT: 'input[name="password"]',
    NEXT_BUTTON: 'button:has-text("Next")',
    LOGIN_BUTTON: 'button[data-testid="LoginForm_Login_Button"]',
  },
  TWEET: {
    ARTICLE: 'article[data-testid="tweet"]',
    TEXT: '[data-testid="tweetText"]',
    AUTHOR_NAME: '[data-testid="User-Name"]',
    TIMESTAMP: 'time',
    LIKE_COUNT: '[data-testid="like"]',
    RETWEET_COUNT: '[data-testid="retweet"]',
    REPLY_COUNT: '[data-testid="reply"]',
    MEDIA: '[data-testid="tweetPhoto"], [data-testid="tweetVideo"]',
    VERIFIED_BADGE: '[data-testid="icon-verified"]',
  },
  PROFILE: {
    USERNAME: '[data-testid="UserName"]',
    BIO: '[data-testid="UserDescription"]',
    FOLLOWERS: 'a[href$="/verified_followers"] span, a[href$="/followers"] span',
    FOLLOWING: 'a[href$="/following"] span',
    PROFILE_IMAGE: '[data-testid="UserAvatar-Container-"] img',
  },
  SEARCH: {
    INPUT: 'input[data-testid="SearchBox_Search_Input"]',
    RESULT: '[data-testid="cellInnerDiv"]',
  },
};
```

## 9. Module Configuration

```typescript
// src/modules/twitter-scraper/twitter-scraper.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TwitterScraperController } from './controllers/twitter-scraper.controller';
import { TwitterScraperService } from './services/twitter-scraper.service';
import { PlaywrightBrowserService } from './services/playwright-browser.service';
import { TweetRepository } from './repositories/tweet.repository';
import { Tweet, TweetSchema } from './schemas/tweet.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Tweet.name, schema: TweetSchema },
    ]),
  ],
  controllers: [TwitterScraperController],
  providers: [
    TwitterScraperService,
    PlaywrightBrowserService,
    TweetRepository,
  ],
  exports: [TwitterScraperService, TweetRepository],
})
export class TwitterScraperModule {}
```

## 10. App Module Update

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validationSchema } from './common/config/env.validation';
import { TwitterScraperModule } from './modules/twitter-scraper/twitter-scraper.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    MongooseModule.forRoot(process.env.MONGODB_URI || 'mongodb://localhost:27017/twitter-scraper'),
    TwitterScraperModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

## Uso de la API

### Login
```bash
curl -X POST http://localhost:3000/api/twitter/login \
  -H "Content-Type: application/json" \
  -d '{"username": "your_username", "password": "your_password"}'
```

### Obtener tweets por usuario
```bash
curl "http://localhost:3000/api/twitter/tweets/username/elonmusk?limit=20&includeReplies=false"
```

### Buscar tweets
```bash
curl -X POST http://localhost:3000/api/twitter/tweets/search \
  -H "Content-Type: application/json" \
  -d '{
    "searchTerm": "artificial intelligence",
    "limit": 50,
    "filters": {
      "language": "en",
      "verified": true
    }
  }'
```

### Ver tweets almacenados
```bash
curl "http://localhost:3000/api/twitter/stored/tweets?page=1&limit=20&username=elonmusk"
```

### Ver estadísticas
```bash
curl "http://localhost:3000/api/twitter/stored/stats"
```
