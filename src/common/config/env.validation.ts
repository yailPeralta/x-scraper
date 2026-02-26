import * as Joi from 'joi';

export interface EnvironmentVariables {
  NODE_ENV: string;
  PORT: number;
  // Twitter
  TWITTER_USERNAME: string;
  TWITTER_PASSWORD: string;
  TWITTER_EMAIL?: string;
  // MongoDB
  MONGODB_USERNAME: string;
  MONGODB_PASSWORD: string;
  MONGODB_HOST: string;
  MONGODB_PORT: number;
  MONGODB_DB_NAME: string;
  // Playwright
  PLAYWRIGHT_BROWSER: 'firefox' | 'chromium';
  PLAYWRIGHT_HEADLESS: boolean;
  PLAYWRIGHT_TIMEOUT: number;
  PLAYWRIGHT_SLOW_MO: number;

  // Scraper engine:
  //   'crawlee'    → Crawlee's PlaywrightCrawler (fingerprint spoofing, proxy rotation)
  //   'playwright' → Persistent Playwright context (shared authenticated session)
  SCRAPER_ENGINE: 'crawlee' | 'playwright';

  // When SCRAPER_ENGINE=crawlee, use playwright-extra with puppeteer-extra-plugin-stealth
  // as the Crawlee launcher instead of the default Playwright browser.
  USE_EXTRA: boolean;

  // Anti-Blocking
  USE_FINGERPRINTS: boolean;
  USE_CAMOUFOX: boolean;
  PROXY_URL?: string;

  // Scraping
  SCRAPING_MAX_TWEETS_PER_REQUEST: number;
  SCRAPING_SCROLL_DELAY: number;
  SCRAPING_RETRY_ATTEMPTS: number;
  SCRAPING_RATE_LIMIT_DELAY: number;

  // X API Official (XDK) Credentials
  X_API_BEARER_TOKEN: string;
  X_API_KEY?: string;
  X_API_SECRET?: string;
  X_API_ACCESS_TOKEN?: string;
  X_API_ACCESS_TOKEN_SECRET?: string;

  // Tracker Configuration
  TRACKER_PROFILE_POLL_INTERVAL: number;
  TRACKER_FOLLOWER_POLL_INTERVAL: number;
  TRACKER_TREND_POLL_INTERVAL: number;
  TRACKER_ENGAGEMENT_POLL_INTERVAL: number;
  TRACKER_TREND_WOEID: number;

  // Cron Tasks
  TRENDING_TWEETS_CRON: string;

  CURRRENT_X_USER_ID: string;

  // Cookies file path for X/Twitter session
  X_COOKIES_FILE: string;

  // When true, authentication is performed exclusively using exported cookies (skips credential login)
  AUTH_ONLY_WITH_EXPORTED_COOKIES: boolean;
}

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),

  // Twitter
  TWITTER_USERNAME: Joi.string().required(),
  TWITTER_PASSWORD: Joi.string().required(),
  TWITTER_EMAIL: Joi.string().email().optional(),

  // MongoDB
  MONGODB_USERNAME: Joi.string().required(),
  MONGODB_PASSWORD: Joi.string().required(),
  MONGODB_HOST: Joi.string().default('localhost'),
  MONGODB_PORT: Joi.number().default(27017),
  MONGODB_DB_NAME: Joi.string().default('twitter-scraper'),

  // Playwright
  PLAYWRIGHT_BROWSER: Joi.string().valid('firefox', 'chromium').default('firefox'),
  PLAYWRIGHT_HEADLESS: Joi.boolean().default(true),
  PLAYWRIGHT_TIMEOUT: Joi.number().default(30000),
  PLAYWRIGHT_SLOW_MO: Joi.number().default(100),

  // Scraper engine
  SCRAPER_ENGINE: Joi.string().valid('crawlee', 'playwright').default('crawlee'),

  // When SCRAPER_ENGINE=crawlee, use playwright-extra + stealth as the Crawlee launcher
  USE_EXTRA: Joi.boolean().default(false),

  // Anti-Blocking
  USE_FINGERPRINTS: Joi.boolean().default(true),
  USE_CAMOUFOX: Joi.boolean().default(false),
  PROXY_URL: Joi.string().uri().allow('').optional(),

  // Scraping
  SCRAPING_MAX_TWEETS_PER_REQUEST: Joi.number().default(100),
  SCRAPING_SCROLL_DELAY: Joi.number().default(2000),
  SCRAPING_RETRY_ATTEMPTS: Joi.number().default(3),
  SCRAPING_RATE_LIMIT_DELAY: Joi.number().default(60000),

  // X API Official (XDK) Credentials
  X_API_BEARER_TOKEN: Joi.string().required(),
  X_API_KEY: Joi.string().optional().allow(''),
  X_API_SECRET: Joi.string().optional().allow(''),
  X_API_ACCESS_TOKEN: Joi.string().optional().allow(''),
  X_API_ACCESS_TOKEN_SECRET: Joi.string().optional().allow(''),

  // Tracker Configuration
  TRACKER_PROFILE_POLL_INTERVAL: Joi.number().default(300000),
  TRACKER_FOLLOWER_POLL_INTERVAL: Joi.number().default(600000),
  TRACKER_TREND_POLL_INTERVAL: Joi.number().default(300000),
  TRACKER_ENGAGEMENT_POLL_INTERVAL: Joi.number().default(60000),
  TRACKER_TREND_WOEID: Joi.number().default(1),

  // Cron Tasks
  TRENDING_TWEETS_CRON: Joi.string().required(),

  CURRENT_X_USER_ID: Joi.string().required(),

  // Cookies file path for X/Twitter session
  X_COOKIES_FILE: Joi.string().default('./sessions/x-cookies.json'),

  // When true, authentication is performed exclusively using exported cookies (skips credential login)
  AUTH_ONLY_WITH_EXPORTED_COOKIES: Joi.boolean().default(false),
});
