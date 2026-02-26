import { Injectable, Logger } from '@nestjs/common';
import { Page } from 'playwright';
import * as fs from 'fs/promises';
import { IBrowserEngineService } from '../interfaces/browser-engine.interface';
import { CrawleeService } from './crawlee.service';

/**
 * CrawleeEngineService
 *
 * IBrowserEngineService implementation that uses Crawlee's PlaywrightCrawler
 * for each navigation task.
 *
 * Crawlee manages its own browser pool with fingerprint spoofing, proxy
 * rotation and session persistence — making this engine ideal for scraping
 * tasks that benefit from anti-detection features.
 *
 * NOTE: Crawlee launches a separate browser instance per crawl and does NOT
 * maintain a persistent browser context. As a result:
 *  - getPage() throws — there is no persistent page between crawls.
 *  - isSessionActive() always returns false — Crawlee has no session state.
 *  - takeScreenshot() is a no-op — no persistent page to capture.
 *
 * For authenticated tasks (login, getUserProfile) use SCRAPER_ENGINE=playwright.
 *
 * Select this engine by setting SCRAPER_ENGINE=crawlee in your .env (default).
 */
@Injectable()
export class CrawleeEngineService implements IBrowserEngineService {
  private readonly logger = new Logger(CrawleeEngineService.name);

  /** Last page seen inside a crawl — available only during navigate() execution. */
  private currentPage: Page | null = null;

  constructor(private readonly crawleeService: CrawleeService) {}

  async init(): Promise<void> {
    // Empty
  }

  async isAuthenticated(): Promise<boolean> {
    this.logger.log('Checking session status on startup...');
    return this.navigate('https://x.com/home', async (page) => {
      // Check for auth_token cookie as a fallback
      const cookies = await page.context().cookies('https://x.com');
      return !!cookies?.find((c) => c.name === 'auth_token');
    });
  }

  /**
   * Navigate to `url` using Crawlee's PlaywrightCrawler and run `collector`.
   *
   * A new crawler is created for each navigate() call so that the correct
   * collector is always bound to the request handler. Reusing a single crawler
   * instance would cause all subsequent calls to execute the first collector
   * (the one captured in the closure at creation time) instead of the current one.
   */
  async navigate<T>(
    url: string,
    collector: (page: Page) => Promise<T>,
  ): Promise<T> {
    let result: T;
    let crawlError: Error | undefined;

    this.logger.debug(`[crawlee] Navigating to ${url}`);

    const crawler = await this.crawleeService.createCrawler(
      async ({ page }) => {
        this.currentPage = page;
        try {
          result = await collector(page);
        } catch (err) {
          crawlError = err as Error;
        } finally {
          this.currentPage = null;
        }
      },
    );

    await crawler.run([url]);

    if (crawlError) throw crawlError;
    return result!;
  }

  /**
   * Returns the page currently active inside a navigate() call.
   * Throws if called outside of a navigate() execution (no persistent context).
   */
  getPage(): Page {
    if (!this.currentPage) {
      throw new Error(
        'CrawleeEngineService has no persistent page. ' +
          'getPage() is only available inside a navigate() callback. ' +
          'For authenticated tasks (login, getUserProfile) use SCRAPER_ENGINE=playwright.',
      );
    }
    return this.currentPage;
  }

  /**
   * Take a screenshot of the current page if inside a navigate() call.
   * Returns an empty string if no page is active.
   */
  async takeScreenshot(name: string): Promise<string> {
    if (!this.currentPage) {
      this.logger.warn(
        `takeScreenshot("${name}") called outside of navigate() — no page available`,
      );
      return '';
    }
    const screenshotPath = `./screenshots/${name}-${Date.now()}.png`;
    await fs.mkdir('./screenshots', { recursive: true });
    await this.currentPage.screenshot({ path: screenshotPath, fullPage: true });
    this.logger.log(`Screenshot saved: ${screenshotPath}`);
    return screenshotPath;
  }
}
