import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrowserContext, Page } from 'playwright';
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs/promises';
import * as path from 'path';

// Add stealth plugin
chromium.use(stealthPlugin());

@Injectable()
export class PlaywrightBrowserService implements OnModuleDestroy {
  private readonly logger = new Logger(PlaywrightBrowserService.name);
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private isAuthenticated = false;
  private sessionPath: string;
  private userDataDir: string;

  constructor(private configService: ConfigService) {
    this.sessionPath = this.configService.get<string>(
      'PLAYWRIGHT_SESSION_PATH',
      './sessions/twitter-session.json',
    );
    this.userDataDir = './sessions/browser-data';
  }

  async initBrowser(): Promise<void> {
    if (this.context) {
      this.logger.log('Browser context already initialized');
      return;
    }

    this.logger.log('Initializing Playwright persistent context with stealth mode...');

    const headless = this.configService.get<boolean>(
      'PLAYWRIGHT_HEADLESS',
      false, // Default to false for debugging/stealth
    );
    const slowMo = this.configService.get<number>('PLAYWRIGHT_SLOW_MO', 100);

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
      '--disable-features=IsolateOrigins,site-per-process', // Often helps with iframe/cross-origin issues
    ];

    try {
      // Ensure user data dir exists
      await fs.mkdir(this.userDataDir, { recursive: true });

      this.context = await chromium.launchPersistentContext(this.userDataDir, {
        headless,
        slowMo,
        args,
        ignoreDefaultArgs: ['--enable-automation'],
        viewport: null,
        locale: 'en-US',
        isMobile: false,
        hasTouch: false,
        javaScriptEnabled: true,
        timezoneId: 'America/New_York',
        geolocation: { longitude: -74.006, latitude: 40.7128 },
        permissions: ['geolocation'],
        acceptDownloads: true,
        channel: 'chrome', // Try to use system Chrome if available, it's less detectable than Chromium
      });

      this.logger.log('Persistent context launched');

      // Helper to check if context is valid
      if (this.context.pages().length > 0) {
        this.page = this.context.pages()[0];
      } else {
        this.page = await this.context.newPage();
      }

      // Configurar timeout global
      const timeout = this.configService.get<number>('PLAYWRIGHT_TIMEOUT', 30000);
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

  async closeBrowser(): Promise<void> {
    if (this.page) {
      await this.page.close().catch(() => {});
    }
    if (this.context) {
      await this.context.close().catch(() => {});
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

  // Legacy method kept for interface compatibility, but persistence is now automatic
  async saveSession(): Promise<void> {
    this.logger.log('Session is automatically saved by persistent context');
  }

  // Legacy method kept for interface compatibility
  async loadSession(): Promise<boolean> {
    this.logger.log('Session is automatically loaded by persistent context');
    return true;
  }

  async isSessionActive(): Promise<boolean> {
    if (!this.page) {
      return false;
    }

    try {
      this.logger.debug('Checking session status...');
      // Use a simpler check primarily, then navigation if needed
      // First, just check if we are on a known page
      const url = this.page.url();
      if (url.includes('x.com/home') || url.includes('twitter.com/home')) {
        this.isAuthenticated = true;
        return true;
      }

      // If not obvious, try a gentle navigation or check cookies
      const cookies = await this.context?.cookies('https://x.com');
      const authCookie = cookies?.find(c => c.name === 'auth_token');
      
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

  async onModuleDestroy() {
    await this.closeBrowser();
  }
}
