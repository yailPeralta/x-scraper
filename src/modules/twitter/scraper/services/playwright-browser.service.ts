import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrowserContext, Page, firefox, chromium } from 'playwright';
import type { PlaywrightLaunchContext } from '@crawlee/playwright';
import {
  BrowserName,
  DeviceCategory,
  OperatingSystemsName,
} from '@crawlee/browser-pool';
import * as fs from 'fs/promises';
import { launchOptions as camoufoxLaunchOptions } from 'camoufox-js';
import { readFileSync, existsSync } from 'fs';
import Database from 'better-sqlite3';

export type BrowserEngine = 'firefox' | 'chromium';

export { BrowserName, DeviceCategory, OperatingSystemsName };

/**
 * PlaywrightBrowserService
 *
 * Responsible solely for the lifecycle of the persistent Playwright browser
 * context: initialisation, session management, screenshots and teardown.
 *
 * Crawlee-specific logic (crawler creation, fingerprints, proxy) has been
 * moved to CrawleeService to keep this service focused on a single concern.
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

  private async createCamoufoxBrowserContextWithCookies(headless: boolean) {
    const browser = await firefox.launch(
      await camoufoxLaunchOptions({
        headless,
        humanizeInput: true,
      }),
    );

    const context = await browser.newContext({
      locale: 'es-AR',
      timezoneId: 'America/Argentina/Cordoba',
      viewport: { width: 1280, height: 800 },
    });

    const cookiesFile = this.configService.get<string>(
      'X_COOKIES_FILE',
      './sessions/x-cookies.json',
    );

    if (!existsSync(cookiesFile)) {
      throw new Error(`Cookies file not found at ${cookiesFile}`);
    }

    const cookies = JSON.parse(readFileSync(cookiesFile, 'utf-8'));

    // Normalizar cookies al formato que espera Playwright/Camoufox.
    // Las cookies exportadas desde extensiones de navegador usan el formato
    // de la API de extensiones (e.g. "no_restriction", "lax" en minúsculas,
    // null), que Playwright no acepta. Se mapean a los valores válidos:
    // "Strict" | "Lax" | "None".
    const sameSiteMap: Record<string, 'Strict' | 'Lax' | 'None'> = {
      strict: 'Strict',
      Strict: 'Strict',
      lax: 'Lax',
      Lax: 'Lax',
      none: 'None',
      None: 'None',
      no_restriction: 'None', // Chrome/Firefox extension API format
    };

    const normalizedCookies = cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain.startsWith('.')
        ? cookie.domain
        : `.${cookie.domain}`,
      path: cookie.path || '/',
      secure: cookie.secure ?? true,
      httpOnly: cookie.httpOnly ?? false,
      sameSite:
        cookie.sameSite && sameSiteMap[cookie.sameSite]
          ? sameSiteMap[cookie.sameSite]
          : 'Lax',
    }));

    await context.addCookies(normalizedCookies);

    return { browser, context };
  }

  private sameSiteToInt(sameSite) {
    switch (sameSite?.toLowerCase()) {
      case 'strict':
        return 2;
      case 'lax':
        return 1;
      default:
        return 0;
    }
  }

  private importCookiesForPersistentContext() {
    const cookiesFile = this.configService.get<string>(
      'X_COOKIES_FILE',
      './sessions/x-cookies.json',
    );

    if (!existsSync(cookiesFile)) {
      throw new Error(`Cookies file not found at ${cookiesFile}`);
    }

    const sqliteFile = './sessions/browser-data-chromium/cookies.sqlite';

    this.logger.log('Importing cookies from', cookiesFile);

    const db = new Database(sqliteFile);
    const cookies = JSON.parse(readFileSync(cookiesFile, 'utf-8'));
    const now = Date.now() * 1000;
    const oneYear = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;

    const insert = db.prepare(`
    INSERT OR REPLACE INTO moz_cookies
      (originAttributes, name, value, host, path, expiry, lastAccessed, creationTime,
       isSecure, isHttpOnly, inBrowserElement, sameSite, rawSameSite, schemeMap, isPartitionedAttributeSet)
    VALUES
      (@originAttributes, @name, @value, @host, @path, @expiry, @lastAccessed, @creationTime,
       @isSecure, @isHttpOnly, 0, @sameSite, @rawSameSite, 0, 0)
  `);

    const insertMany = db.transaction((cookies) => {
      for (const cookie of cookies) {
        const sameSite = this.sameSiteToInt(cookie.sameSite);
        insert.run({
          originAttributes: '',
          name: cookie.name,
          value: cookie.value,
          host: cookie.domain.startsWith('.')
            ? cookie.domain
            : `.${cookie.domain}`,
          path: cookie.path || '/',
          expiry:
            cookie.expires && cookie.expires !== -1
              ? Math.floor(cookie.expires)
              : oneYear,
          lastAccessed: now,
          creationTime: now,
          isSecure: cookie.secure ? 1 : 0,
          isHttpOnly: cookie.httpOnly ? 1 : 0,
          sameSite,
          rawSameSite: sameSite,
        });
      }
    });

    insertMany(cookies);
    this.logger.log(`✅ ${cookies.length} cookies importadas en ${sqliteFile}`);
    db.close();
  }

  async initBrowser(): Promise<BrowserContext> {
    if (this.context) {
      this.logger.log('Browser context already initialized');
      return this.context;
    }

    this.logger.log(
      `Initializing persistent context with ${this.browserEngine} engine...`,
    );

    const headless = this.configService.get<boolean>(
      'PLAYWRIGHT_HEADLESS',
      false,
    );
    const slowMo = this.configService.get<number>('PLAYWRIGHT_SLOW_MO', 100);
    const useCamoufox = this.configService.get<boolean>('USE_CAMOUFOX', false);
    const useExtra = this.configService.get<boolean>('USE_EXTRA', false);

    try {
      await fs.mkdir(this.userDataDir, { recursive: true });

      if (useExtra) {
        // playwright-extra: chromium with puppeteer-extra-plugin-stealth
        // Dynamic import to avoid loading the module when USE_EXTRA=false
        this.logger.log(
          'Initializing playwright-extra chromium with stealth plugin...',
        );
        const { chromium: chromiumExtra } = await import('playwright-extra');
        const { default: StealthPlugin } =
          await import('puppeteer-extra-plugin-stealth');
        chromiumExtra.use(StealthPlugin());

        await this.importCookiesForPersistentContext();

        this.context = await chromiumExtra.launchPersistentContext(
          this.userDataDir,
          {
            headless,
            slowMo,
            locale: 'es-AR',
            timezoneId: 'America/Argentina/Cordoba',
            viewport: { width: 1280, height: 800 },
          },
        );

        this.logger.log(
          'Persistent context launched with playwright-extra + stealth',
        );
      } else if (useCamoufox) {
        const authOnlyWithExportedCookies = this.configService.get<boolean>(
          'AUTH_ONLY_WITH_EXPORTED_COOKIES',
          false,
        );

        if (authOnlyWithExportedCookies) {
          this.logger.log('Use x cookies to authenticate');
          const { context } =
            await this.createCamoufoxBrowserContextWithCookies(headless);
          this.context = context;
        } else {
          await this.importCookiesForPersistentContext();
          this.logger.log('Persistent context launched with camoufox');
          this.context = await firefox.launchPersistentContext(
            this.userDataDir,
            await camoufoxLaunchOptions({
              headless,
              humanizeInput: true,
              slowMo,
              locale: 'es-AR',
              timezoneId: 'America/Argentina/Cordoba',
              viewport: { width: 1280, height: 800 },
            }),
          );
        }
      } else {
        // Standard Playwright persistent context
        if (this.browserEngine === 'firefox') {
          this._launchContext = this.buildFirefoxLaunchContext(
            headless,
            slowMo,
          );
        } else {
          this._launchContext = this.buildChromiumLaunchContext(
            headless,
            slowMo,
          );
        }

        await this.importCookiesForPersistentContext();

        const launcher = this._launchContext.launcher ?? firefox;
        this.context = await launcher.launchPersistentContext(
          this._launchContext.userDataDir ?? this.userDataDir,
          this._launchContext.launchOptions ?? {},
        );

        this.logger.log(
          `Persistent context launched with ${this.browserEngine}`,
        );
      }

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
    this.logger.log(
      'Building Firefox launch context with anti-detection preferences...',
    );

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
          longitude: -64.52970321764124,
          latitude: -30.8677727609467,
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
    this.logger.log(
      'Building Chromium launch context with anti-detection args...',
    );

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
          longitude: -64.52970321764124,
          latitude: -30.8677727609467,
        },
        permissions: ['geolocation'],
        acceptDownloads: true,
        channel: 'chrome',
      },
    };
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

  async takeScreenshot(name: string): Promise<string> {
    this.logger.log(`Attempting to take screenshot: ${name}`);
    if (!this.page) {
      this.logger.error('Browser not initialized for screenshot');
      throw new Error('Browser not initialized');
    }
    try {
      const screenshotPath = `./screenshots/${name}-${Date.now()}.png`;
      await fs.mkdir('./screenshots', { recursive: true });
      await this.page.screenshot({ path: screenshotPath, fullPage: true });
      this.logger.log(`Screenshot saved: ${screenshotPath}`);
      return screenshotPath;
    } catch (error) {
      this.logger.error(`Failed to take screenshot ${name}`, error);
      throw error;
    }
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
