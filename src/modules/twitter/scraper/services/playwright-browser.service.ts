import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrowserContext, BrowserType, Page, firefox, chromium } from 'playwright';
import { PlaywrightCrawler } from '@crawlee/playwright';
import type { PlaywrightLaunchContext } from '@crawlee/playwright';
import { BrowserName, DeviceCategory, OperatingSystemsName } from '@crawlee/browser-pool';
import { launchOptions as camoufoxLaunchOptions } from 'camoufox-js';
import type { FingerprintOptions } from '@crawlee/browser-pool';
import { RequestQueue } from 'crawlee';
import * as fs from 'fs/promises';

export type BrowserEngine = 'firefox' | 'chromium';

export { BrowserName, DeviceCategory, OperatingSystemsName };

export interface CrawlerOptions {
  headless?: boolean;
  slowMo?: number;
  /** Enable Crawlee browser fingerprint spoofing (default: reads USE_FINGERPRINTS env, fallback true) */
  useFingerprints?: boolean;
  /** Crawlee FingerprintOptions for customising browser/OS/device fingerprints */
  fingerprintOptions?: FingerprintOptions;
  /** Proxy URL, e.g. http://user:pass@proxy.example.com:8080 (default: reads PROXY_URL env) */
  proxyUrl?: string;
  /** Use Camoufox stealth Firefox build — automatically disables fingerprints (default: reads USE_CAMOUFOX env, fallback false) */
  useCamoufox?: boolean;
  requestQueue?: RequestQueue;
}

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
  private _launchContext: PlaywrightLaunchContext | null = null;

  constructor(private configService: ConfigService) {
    this.browserEngine = this.configService.get<BrowserEngine>(
      'PLAYWRIGHT_BROWSER',
      'firefox',
    );
    this.userDataDir = `./sessions/browser-data-${this.browserEngine}`;
  }

  async initBrowser(): Promise<BrowserContext> {
    if (this.context) {
      this.logger.log('Browser context already initialized');
      return this.context;
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
      const useCamoufox = this.configService.get<boolean>('USE_CAMOUFOX', false);

      // Build the launch context configuration
      if (this.browserEngine === 'firefox' || useCamoufox) {
        this._launchContext = this.buildFirefoxLaunchContext(headless, slowMo);
      } else {
        this._launchContext = this.buildChromiumLaunchContext(headless, slowMo);
      }

      // Launch the persistent context using the configuration
      const launcher = this._launchContext.launcher ?? firefox;
      this.context = await launcher.launchPersistentContext(
        this._launchContext.userDataDir ?? this.userDataDir,
        this._launchContext.launchOptions ?? {},
      );

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
      return this.context;
    } catch (error) {
      this.logger.error('Failed to initialize browser', error);
      throw error;
    }
  }

  /**
   * Build a PlaywrightLaunchContext for Firefox with anti-detection preferences.
   * Returns a configuration object — does NOT launch the browser.
   */
  private buildFirefoxLaunchContext(
    headless: boolean,
    slowMo: number,
  ): PlaywrightLaunchContext {
    this.logger.log('Building Firefox launch context with anti-detection preferences...');

    return {
      launcher: firefox,
      userDataDir: this.userDataDir,
      launchOptions: {
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
      },
    };
  }

  /**
   * Build a PlaywrightLaunchContext for Chromium with anti-detection args.
   * Returns a configuration object — does NOT launch the browser.
   */
  private buildChromiumLaunchContext(
    headless: boolean,
    slowMo: number,
  ): PlaywrightLaunchContext {
    this.logger.log('Building Chromium launch context with anti-detection args...');

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

    return {
      launcher: chromium,
      userDataDir: this.userDataDir,
      useChrome: true,
      launchOptions: {
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
      },
    };
  }

  /**
   * Create a one-shot PlaywrightCrawler to run a single navigation task
   * using Crawlee's request queue model. Useful for isolated scraping jobs
   * that benefit from Crawlee's retry/session management.
   *
   * Anti-blocking features (all configurable via env or per-call options):
   *  - Browser fingerprints (USE_FINGERPRINTS / useFingerprints)
   *  - Camoufox stealth build  (USE_CAMOUFOX  / useCamoufox)
   *  - Proxy rotation           (PROXY_URL    / proxyUrl)
   */
  async createCrawler(
    requestHandler: (context: {
      page: Page;
      request: { url: string };
      handleCloudflareChallenge?: () => Promise<void>;
    }) => Promise<void>,
    options: CrawlerOptions = {},
  ): Promise<PlaywrightCrawler> {
    // --- resolve options from env with per-call overrides ---
    const useFingerprints =
      options.useFingerprints ??
      this.configService.get<boolean>('USE_FINGERPRINTS', true);
    const useCamoufox =
      options.useCamoufox ??
      this.configService.get<boolean>('USE_CAMOUFOX', false);
    const proxyUrl =
      options.proxyUrl ||
      this.configService.get<string>('PROXY_URL', '') ||
      undefined;

    // Camoufox has its own fingerprint engine — disable Crawlee's to avoid conflicts
    const effectiveUseFingerprints = useCamoufox ? false : useFingerprints;

    const headless =
      options.headless ??
      this.configService.get<boolean>('PLAYWRIGHT_HEADLESS', false);
    const slowMo =
      options.slowMo ??
      this.configService.get<number>('PLAYWRIGHT_SLOW_MO', 100);

    this.logger.log(
      `Creating crawler — fingerprints: ${effectiveUseFingerprints}, camoufox: ${useCamoufox}, proxy: ${proxyUrl ?? 'none'}`,
    );

    // --- build launch context, reusing the same builder methods ---
    let launchContext: PlaywrightLaunchContext;

    if (useCamoufox) {
      const camoufoxOpts = await camoufoxLaunchOptions({ headless });
      launchContext = {
        launcher: firefox,
        launchOptions: camoufoxOpts,
        ...(proxyUrl && { proxyUrl }),
      };
    } else {
      // Reuse the stored launch context if available, otherwise build a fresh one.
      // Strip userDataDir and useChrome — Crawlee's BrowserPool manages its own
      // browser instances and would conflict with the persistent context already
      // opened by initBrowser() if we passed the same userDataDir.
      const { userDataDir: _stripUDD, useChrome: _stripUC, ...baseLaunchContext } =
        this._launchContext ??
        (this.browserEngine === 'firefox'
          ? this.buildFirefoxLaunchContext(headless, slowMo)
          : this.buildChromiumLaunchContext(headless, slowMo));

      launchContext = {
        ...baseLaunchContext,
        ...(proxyUrl && { proxyUrl }),
      };
    }

    // --- assemble crawler config ---
    const crawlerConfig: ConstructorParameters<typeof PlaywrightCrawler>[0] = {
      requestHandler: requestHandler as any,
      launchContext,
      browserPoolOptions: {
        useFingerprints: effectiveUseFingerprints,
        ...(effectiveUseFingerprints &&
          options.fingerprintOptions && {
            fingerprintOptions: options.fingerprintOptions,
          }),
      },
      // When using Camoufox, automatically handle Cloudflare challenges
      ...(useCamoufox && {
        postNavigationHooks: [
          async ({ handleCloudflareChallenge }: any) => {
            if (typeof handleCloudflareChallenge === 'function') {
              await handleCloudflareChallenge();
            }
          },
        ],
      }),
      // Disable Crawlee's built-in storage to avoid conflicts with NestJS
      maxConcurrency: 1,
      maxRequestsPerCrawl: 10,
      persistCookiesPerSession: true,
    };

    return new PlaywrightCrawler(crawlerConfig);
  }

  async closeBrowser(): Promise<void> {
    if (this.page) {
      await this.page.close().catch(() => {});
    }
    if (this.context) {
      await this.context.close().catch(() => {});
    }
    this.context = null;
    this.page = null;
    this._launchContext = null;
    this.isAuthenticated = false;
    this.logger.log('Browser closed');
  }

  getPage(): Page {
    if (!this.page) {
      throw new Error('Browser not initialized. Call initBrowser() first.');
    }
    return this.page;
  }

  /**
   * Returns the stored PlaywrightLaunchContext built during initBrowser().
   * Null if the browser has not been initialized yet.
   */
  getLaunchContext(): PlaywrightLaunchContext | null {
    return this._launchContext;
  }

  async isSessionActive(): Promise<boolean> {
    if (!this.page) {
      return false;
    }

    try {
      this.logger.debug('Checking session status...');
      const url = this.page.url();
      if (
        url.includes('x.com/home') || 
        url.includes('twitter.com/home') || 
        url.includes('x.com/explore') || 
        url.includes('twitter.com/explore') || 
        url.includes('x.com/search') || 
        url.includes('twitter.com/search')
      ) {
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
