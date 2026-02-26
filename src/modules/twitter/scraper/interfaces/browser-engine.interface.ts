import { Page } from 'playwright';

/**
 * NestJS injection token for IBrowserEngineService.
 * Use @Inject(BROWSER_ENGINE_SERVICE) to inject the active engine.
 */
export const BROWSER_ENGINE_SERVICE = 'BROWSER_ENGINE_SERVICE';

/**
 * IBrowserEngineService
 *
 * Abstraction layer over the browser automation engine.
 * Implementations can use plain Playwright (persistent context)
 * or Crawlee's PlaywrightCrawler interchangeably.
 *
 * Consumers (TrendingScraperService, TwitterScraperService) depend only
 * on this interface and are unaware of the underlying engine.
 */
export interface IBrowserEngineService {
  /**
   * Initialise the engine. Called once during NestJS module bootstrap.
   *
   * - PlaywrightEngineService: launches the persistent browser context.
   * - CrawleeEngineService: no-op — Crawlee manages its own browser pool.
   */
  init(): Promise<void>;

  /**
   * Navigate to `url` and execute `collector` with the resulting Page.
   * The implementation decides whether to use the persistent Playwright
   * context or a Crawlee-managed browser instance.
   */
  navigate<T>(url: string, collector: (page: Page) => Promise<T>): Promise<T>;

  /**
   * Return the currently active Page (persistent context).
   * Useful for operations that need direct page access (e.g. response interception).
   */
  getPage(): Page;

  /**
   * Check whether the Twitter session is still active.
   */
  isAuthenticated(): Promise<boolean>;

  /**
   * Capture a screenshot of the current page and save it to ./screenshots/.
   */
  takeScreenshot(name: string): Promise<string>;
}
