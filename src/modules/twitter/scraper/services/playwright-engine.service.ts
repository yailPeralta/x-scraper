import { Injectable, Logger } from '@nestjs/common';
import { Page } from 'playwright';
import { IBrowserEngineService } from '../interfaces/browser-engine.interface';
import { PlaywrightBrowserService } from './playwright-browser.service';

/**
 * PlaywrightEngineService
 *
 * IBrowserEngineService implementation that uses the persistent Playwright
 * browser context managed by PlaywrightBrowserService.
 *
 * All navigations share the same authenticated session (cookies, localStorage),
 * making this engine ideal for tasks that require an active Twitter login.
 *
 * Select this engine by setting SCRAPER_ENGINE=playwright in your .env.
 */
@Injectable()
export class PlaywrightEngineService implements IBrowserEngineService {
  private readonly logger = new Logger(PlaywrightEngineService.name);

  constructor(private readonly browserService: PlaywrightBrowserService) {}

  /**
   * Launch the persistent browser context.
   * Called once during NestJS module bootstrap via TwitterScraperService.onModuleInit().
   */
  async init(): Promise<void> {
    await this.browserService.initBrowser();
  }

  /**
   * Navigate to `url` using the persistent browser context and run `collector`.
   * The page is reused across calls — no new browser instance is created.
   */
  async navigate<T>(
    url: string,
    collector: (page: Page) => Promise<T>,
  ): Promise<T> {
    const page = this.browserService.getPage();
    this.logger.debug(`[playwright] Navigating to ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    return collector(page);
  }

  /**
   * Return the active Page from the persistent context.
   */
  getPage(): Page {
    return this.browserService.getPage();
  }

  /**
   * Check whether the Twitter session is still active.
   */
  isAuthenticated(): Promise<boolean> {
    return this.navigate('https://x.com/home', async (page) => {
      // Check for auth_token cookie as a fallback
      const cookies = await page.context().cookies('https://x.com');
      return !!cookies?.find((c) => c.name === 'auth_token');
    });
  }

  /**
   * Delegate screenshot capture to the underlying browser service.
   */
  takeScreenshot(name: string): Promise<string> {
    return this.browserService.takeScreenshot(name);
  }
}
