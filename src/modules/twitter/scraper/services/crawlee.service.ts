import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Page, firefox } from 'playwright';
import { PlaywrightCrawler } from '@crawlee/playwright';
import { launchOptions as camoufoxLaunchOptions } from 'camoufox-js';
import type { FingerprintOptions } from '@crawlee/browser-pool';
import * as fs from 'fs/promises';

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
}

/**
 * CrawleeService
 *
 * Owns all Crawlee-specific logic: creating PlaywrightCrawler instances.
 *
 * By default, Crawlee manages its own browser pool and launch context.
 * Two optional stealth modes are available via environment variables:
 *
 *  USE_EXTRA=true     → playwright-extra + puppeteer-extra-plugin-stealth as launcher
 *  USE_CAMOUFOX=true  → Camoufox stealth Firefox build as launcher
 *
 * Anti-blocking features (all configurable via env or per-call options):
 *  - Browser fingerprints (USE_FINGERPRINTS / useFingerprints)
 *  - playwright-extra stealth (USE_EXTRA)
 *  - Camoufox stealth build  (USE_CAMOUFOX)
 *  - Proxy rotation           (PROXY_URL / proxyUrl)
 */
/** Directory where Crawlee persists the browser profile (cookies, localStorage). */
const CRAWLEE_USER_DATA_DIR = './sessions/crawlee-browser-data';

@Injectable()
export class CrawleeService {
  private readonly logger = new Logger(CrawleeService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Create a PlaywrightCrawler instance.
   *
   * Launch context selection (in priority order):
   *  1. USE_CAMOUFOX=true  → Camoufox stealth Firefox
   *  2. USE_EXTRA=true     → playwright-extra chromium with stealth plugin
   *  3. default            → Crawlee's own browser pool (no custom launcher)
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
    const useExtra = this.configService.get<boolean>('USE_EXTRA', false);
    const proxyUrl =
      options.proxyUrl ||
      this.configService.get<string>('PROXY_URL', '') ||
      undefined;

    // Camoufox and playwright-extra have their own fingerprint engines —
    // disable Crawlee's to avoid conflicts.
    const effectiveUseFingerprints =
      useCamoufox || useExtra ? false : useFingerprints;

    const headless =
      options.headless ??
      this.configService.get<boolean>('PLAYWRIGHT_HEADLESS', false);

    this.logger.log(
      `Creating crawler — fingerprints: ${effectiveUseFingerprints}, camoufox: ${useCamoufox}, extra: ${useExtra}, proxy: ${proxyUrl ?? 'none'}`,
    );

    // Ensure the session directory exists before launching
    await fs.mkdir(CRAWLEE_USER_DATA_DIR, { recursive: true });

    // --- build launch context ---
    let launchContext: Record<string, any>;

    if (useCamoufox) {
      // Camoufox: stealth Firefox build with Cloudflare challenge handling
      // Note: Camoufox does not support userDataDir — session is not persisted.
      const camoufoxOpts = await camoufoxLaunchOptions({ headless });
      launchContext = {
        launcher: firefox,
        launchOptions: camoufoxOpts,
        ...(proxyUrl && { proxyUrl }),
      };
    } else if (useExtra) {
      // playwright-extra: chromium with puppeteer-extra-plugin-stealth
      // Dynamic import to avoid loading the module when USE_EXTRA=false
      const { chromium: chromiumExtra } = await import('playwright-extra');
      const { default: StealthPlugin } =
        await import('puppeteer-extra-plugin-stealth');
      chromiumExtra.use(StealthPlugin());

      launchContext = {
        launcher: chromiumExtra,
        userDataDir: CRAWLEE_USER_DATA_DIR,
        launchOptions: {
          headless,
          ...(proxyUrl && { proxy: { server: proxyUrl } }),
        },
      };
    } else {
      // Default: Crawlee's own browser pool with userDataDir for session persistence.
      // Pass launchOptions explicitly so PLAYWRIGHT_HEADLESS is respected.
      launchContext = {
        userDataDir: CRAWLEE_USER_DATA_DIR,
        launchOptions: {
          headless,
          ...(proxyUrl && { proxy: { server: proxyUrl } }),
        },
      };
    }

    // --- assemble crawler config ---
    const crawlerConfig: ConstructorParameters<typeof PlaywrightCrawler>[0] = {
      requestHandler: requestHandler as any,
      browserPoolOptions: {
        useFingerprints: effectiveUseFingerprints,
        ...(effectiveUseFingerprints &&
          options.fingerprintOptions && {
            fingerprintOptions: options.fingerprintOptions,
          }),
      },
      ...(launchContext && { launchContext }),
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
      maxConcurrency: 1,
      maxRequestsPerCrawl: 10,
      // Allow long-running scraping loops (e.g. getTweetsFromSearchTerm can take
      // several minutes with 50 scrolls × 2s delay + extraction time).
      // Default Crawlee value is 60s which is too short for paginated scraping.
      requestHandlerTimeoutSecs: 600,
      // Activates the Session pool (default is true).
      useSessionPool: true,
      // Overrides default Session pool configuration
      sessionPoolOptions: { maxPoolSize: 100 },
      persistCookiesPerSession: true,
    };

    return new PlaywrightCrawler(crawlerConfig);
  }
}
