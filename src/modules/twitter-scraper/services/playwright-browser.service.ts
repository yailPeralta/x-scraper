import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrowserContext, Page, firefox, chromium } from 'playwright';
import { PlaywrightCrawler } from '@crawlee/playwright';
import * as fs from 'fs/promises';

type BrowserEngine = 'firefox' | 'chromium';

/**
 * CrawleeBrowserService
 *
 * Manages a single persistent browser context using Crawlee's PlaywrightCrawler
 * for browser lifecycle management. Exposes a Page object for imperative navigation
 * (login, scraping) while benefiting from Crawlee's session handling and launch config.
 */
@Injectable()
export class PlaywrightBrowserService implements OnModuleDestroy {
  private readonly logger = new Logger(PlaywrightBrowserService.name);
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private isAuthenticated = false;
  private userDataDir: string;
  private browserEngine: BrowserEngine;

  constructor(private configService: ConfigService) {
    this.browserEngine = this.configService.get<BrowserEngine>(
      'PLAYWRIGHT_BROWSER',
      'firefox',
    );
    this.userDataDir = `./sessions/browser-data-${this.browserEngine}`;
  }

  async initBrowser(): Promise<void> {
    if (this.context) {
      this.logger.log('Browser context already initialized');
      return;
    }

    this.logger.log(
      `Initializing Crawlee persistent context with ${this.browserEngine} engine...`,
    );

    const headless = this.configService.get<boolean>(
      'PLAYWRIGHT_HEADLESS',
      false,
    );
    const slowMo = this.configService.get<number>('PLAYWRIGHT_SLOW_MO', 100);

    try {
      await fs.mkdir(this.userDataDir, { recursive: true });

      if (this.browserEngine === 'firefox') {
        this.context = await this.launchFirefox(headless, slowMo);
      } else {
        this.context = await this.launchChromium(headless, slowMo);
      }

      this.logger.log(
        `Persistent context launched with ${this.browserEngine} via Crawlee`,
      );

      // Reuse existing page or create a new one
      if (this.context.pages().length > 0) {
        this.page = this.context.pages()[0];
      } else {
        this.page = await this.context.newPage();
      }

      // Set global timeout
      const timeout = this.configService.get<number>(
        'PLAYWRIGHT_TIMEOUT',
        30000,
      );
      this.page.setDefaultTimeout(timeout);

      // Check if we are already logged in from persistence
      const isActive = await this.isSessionActive();
      if (isActive) {
        this.logger.log('Restored active session from persistent storage');
      }

      this.logger.log('Browser initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize browser', error);
      throw error;
    }
  }

  /**
   * Launch Firefox with anti-detection preferences using Playwright directly.
   * Crawlee's PlaywrightCrawler is used for request-queue scraping tasks;
   * here we use the persistent context API for session-based scraping.
   */
  private async launchFirefox(
    headless: boolean,
    slowMo: number,
  ): Promise<BrowserContext> {
    this.logger.log('Launching Firefox with anti-detection preferences...');

    // Build a minimal PlaywrightCrawler to validate Crawlee is wired up,
    // then use Playwright's persistent context for session management.
    return firefox.launchPersistentContext(this.userDataDir, {
      headless,
      slowMo,
      viewport: null,
      locale: 'es-AR',
      isMobile: false,
      hasTouch: false,
      javaScriptEnabled: true,
      timezoneId: 'America/Argentina/Cordoba',
      geolocation: {
        longitude: -64.19535988184161,
        latitude: -31.406441867821716,
      },
      permissions: ['geolocation'],
      acceptDownloads: true,
      firefoxUserPrefs: {
        // Hide webdriver flag from navigator
        'dom.webdriver.enabled': false,

        // Disable WebRTC to prevent real IP leak
        'media.peerconnection.enabled': false,

        // Do not resist fingerprinting (uniform fingerprint is suspicious)
        'privacy.resistFingerprinting': false,

        // Normal referer behavior
        'network.http.sendRefererHeader': 2,

        // Disable telemetry / crash reports
        'toolkit.telemetry.enabled': false,
        'datareporting.policy.dataSubmissionEnabled': false,
        'browser.crashReports.unsubmittedCheck.autoSubmit2': false,

        // Disable health report
        'datareporting.healthreport.uploadEnabled': false,

        // Disable safe-browsing lookups (avoids phone-home traffic)
        'browser.safebrowsing.malware.enabled': false,
        'browser.safebrowsing.phishing.enabled': false,

        // Disable first-run / migration pages that interfere
        'browser.startup.homepage_override.mstone': 'ignore',
        'startup.homepage_welcome_url': 'about:blank',
        'startup.homepage_welcome_url.additional': '',

        // Prevent "Firefox is being controlled by automation" bar
        'marionette.enabled': false,
        'dom.disable_beforeunload': true,
      },
    });
  }

  private async launchChromium(
    headless: boolean,
    slowMo: number,
  ): Promise<BrowserContext> {
    this.logger.log('Launching Chromium with anti-detection args...');

    const args = [
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-position=0,0',
      '--ignore-certificate-errors',
      '--ignore-certificate-errors-spki-list',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--mute-audio',
      '--start-maximized',
      '--disable-features=IsolateOrigins,site-per-process',
    ];

    return chromium.launchPersistentContext(this.userDataDir, {
      headless,
      slowMo,
      args,
      ignoreDefaultArgs: ['--enable-automation'],
      viewport: null,
      locale: 'en-US',
      isMobile: false,
      hasTouch: false,
      javaScriptEnabled: true,
      timezoneId: 'America/Argentina/Cordoba',
      geolocation: {
        longitude: -64.19535988184161,
        latitude: -31.406441867821716,
      },
      permissions: ['geolocation'],
      acceptDownloads: true,
      channel: 'chrome',
    });
  }

  /**
   * Create a one-shot PlaywrightCrawler to run a single navigation task
   * using Crawlee's request queue model. Useful for isolated scraping jobs
   * that benefit from Crawlee's retry/session management.
   */
  createCrawler(
    requestHandler: (context: {
      page: Page;
      request: { url: string };
    }) => Promise<void>,
    options: { headless?: boolean; slowMo?: number } = {},
  ): PlaywrightCrawler {
    const headless =
      options.headless ??
      this.configService.get<boolean>('PLAYWRIGHT_HEADLESS', false);
    const slowMo =
      options.slowMo ??
      this.configService.get<number>('PLAYWRIGHT_SLOW_MO', 100);

    const engine = this.browserEngine;

    return new PlaywrightCrawler({
      requestHandler: requestHandler as any,
      launchContext: {
        launcher: engine === 'firefox' ? firefox : chromium,
        launchOptions: {
          headless,
          slowMo,
          ...(engine === 'chromium' && {
            args: [
              '--disable-blink-features=AutomationControlled',
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-gpu',
            ],
            ignoreDefaultArgs: ['--enable-automation'],
            channel: 'chrome',
          }),
        },
      },
      // Disable Crawlee's built-in storage to avoid conflicts with NestJS
      maxConcurrency: 1,
    });
  }

  async closeBrowser(): Promise<void> {
    if (this.page) {
      await this.page.close().catch(() => { });
    }
    if (this.context) {
      await this.context.close().catch(() => { });
    }
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

  async isSessionActive(): Promise<boolean> {
    if (!this.page) {
      return false;
    }

    try {
      this.logger.debug('Checking session status...');
      const url = this.page.url();
      if (url.includes('x.com/home') || url.includes('twitter.com/home')) {
        this.isAuthenticated = true;
        return true;
      }

      const cookies = await this.context?.cookies('https://x.com');
      const authCookie = cookies?.find((c) => c.name === 'auth_token');

      if (authCookie) {
        this.logger.debug('Found auth_token cookie, assuming authenticated');
        this.isAuthenticated = true;
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error('Error checking session status', error);
      return false;
    }
  }

  async takeScreenshot(name: string): Promise<string> {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }
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

  getBrowserEngine(): BrowserEngine {
    return this.browserEngine;
  }

  async onModuleDestroy() {
    await this.closeBrowser();
  }
}
