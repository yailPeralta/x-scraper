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

  // Scraping
  SCRAPING_MAX_TWEETS_PER_REQUEST: number;
  SCRAPING_SCROLL_DELAY: number;
  SCRAPING_RETRY_ATTEMPTS: number;
  SCRAPING_RATE_LIMIT_DELAY: number;
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

  // Scraping
  SCRAPING_MAX_TWEETS_PER_REQUEST: Joi.number().default(100),
  SCRAPING_SCROLL_DELAY: Joi.number().default(2000),
  SCRAPING_RETRY_ATTEMPTS: Joi.number().default(3),
  SCRAPING_RATE_LIMIT_DELAY: Joi.number().default(60000),
});
