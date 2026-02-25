/**
 * ScrapingThrottle
 *
 * A utility class that introduces human-like, randomised delays during
 * high-volume scraping sessions to reduce the risk of being rate-limited
 * or blocked by x.com.
 *
 * Behaviour
 * ---------
 * - For every tweet processed it records a "tick".
 * - When the total collected count exceeds `burstThreshold`, the throttle
 *   becomes active and starts inserting pauses.
 * - Every `longPauseEvery` ticks (randomised ± jitter) a longer "human-like"
 *   pause is taken; otherwise a short random pause is inserted.
 * - An optional exponential-backoff mode can be triggered manually when a
 *   rate-limit signal is detected (e.g. empty page, CAPTCHA, HTTP 429).
 *
 * Usage
 * -----
 * ```ts
 * const throttle = new ScrapingThrottle({ burstThreshold: 50 });
 *
 * for (const element of elements) {
 *   const data = await extractTweetData(element);
 *   collected.push(data);
 *   await throttle.tick(collected.length);   // inserts delay when needed
 * }
 *
 * // If you detect a rate-limit signal:
 * await throttle.backoff();
 * ```
 */
export interface ScrapingThrottleOptions {
  /**
   * Number of items collected before the throttle starts inserting pauses.
   * Below this threshold no delays are added (fast path for small requests).
   * @default 50
   */
  burstThreshold?: number;

  /**
   * Minimum delay (ms) for a normal inter-tweet pause.
   * @default 200
   */
  minDelay?: number;

  /**
   * Maximum delay (ms) for a normal inter-tweet pause.
   * @default 800
   */
  maxDelay?: number;

  /**
   * Minimum delay (ms) for a long "human-like" pause.
   * @default 2000
   */
  longPauseMin?: number;

  /**
   * Maximum delay (ms) for a long "human-like" pause.
   * @default 5000
   */
  longPauseMax?: number;

  /**
   * A long pause is triggered every N ticks, where N is randomly chosen
   * between `longPauseEveryMin` and `longPauseEveryMax`.
   * @default 10
   */
  longPauseEveryMin?: number;

  /**
   * Upper bound for the random long-pause interval.
   * @default 20
   */
  longPauseEveryMax?: number;

  /**
   * Base delay (ms) for the first backoff step.
   * Each successive call to `backoff()` doubles this value up to `maxBackoff`.
   * @default 5000
   */
  backoffBase?: number;

  /**
   * Maximum backoff delay (ms).
   * @default 60000
   */
  maxBackoff?: number;
}

export class ScrapingThrottle {
  private readonly burstThreshold: number;
  private readonly minDelay: number;
  private readonly maxDelay: number;
  private readonly longPauseMin: number;
  private readonly longPauseMax: number;
  private readonly longPauseEveryMin: number;
  private readonly longPauseEveryMax: number;
  private readonly backoffBase: number;
  private readonly maxBackoff: number;

  /** Ticks since the last long pause. */
  private ticksSinceLongPause = 0;

  /** Next long-pause threshold (randomised each time). */
  private nextLongPauseAt: number;

  /** Current backoff delay (doubles on each backoff() call). */
  private currentBackoff: number;

  constructor(options: ScrapingThrottleOptions = {}) {
    this.burstThreshold = options.burstThreshold ?? 50;
    this.minDelay = options.minDelay ?? 200;
    this.maxDelay = options.maxDelay ?? 800;
    this.longPauseMin = options.longPauseMin ?? 2000;
    this.longPauseMax = options.longPauseMax ?? 5000;
    this.longPauseEveryMin = options.longPauseEveryMin ?? 10;
    this.longPauseEveryMax = options.longPauseEveryMax ?? 20;
    this.backoffBase = options.backoffBase ?? 5000;
    this.maxBackoff = options.maxBackoff ?? 60000;

    this.currentBackoff = this.backoffBase;
    this.nextLongPauseAt = this.randomInt(
      this.longPauseEveryMin,
      this.longPauseEveryMax,
    );
  }

  /**
   * Call this after each item is collected.
   *
   * @param collectedCount - Total number of items collected so far.
   *
   * If `collectedCount` is at or below `burstThreshold`, this is a no-op
   * (fast path for small requests that don't need throttling).
   * Otherwise it inserts either a short random delay or a long human-like
   * pause depending on how many ticks have elapsed since the last long pause.
   */
  async tick(collectedCount: number): Promise<void> {
    if (collectedCount <= this.burstThreshold) return;

    this.ticksSinceLongPause++;

    if (this.ticksSinceLongPause >= this.nextLongPauseAt) {
      // Long human-like pause
      const delay = this.randomInt(this.longPauseMin, this.longPauseMax);
      await this.sleep(delay);

      // Reset counter and pick a new random threshold for the next long pause
      this.ticksSinceLongPause = 0;
      this.nextLongPauseAt = this.randomInt(
        this.longPauseEveryMin,
        this.longPauseEveryMax,
      );
    } else {
      // Short random pause
      const delay = this.randomInt(this.minDelay, this.maxDelay);
      await this.sleep(delay);
    }
  }

  /**
   * Trigger an exponential-backoff pause.
   *
   * Call this when a rate-limit signal is detected (e.g. empty results,
   * CAPTCHA, HTTP 429). Each successive call doubles the wait time up to
   * `maxBackoff`. The backoff counter resets after a successful
   * `resetBackoff()` call.
   *
   * @returns The actual delay applied (ms).
   */
  async backoff(): Promise<number> {
    const delay = this.currentBackoff;
    await this.sleep(delay);

    // Double for next time, capped at maxBackoff
    this.currentBackoff = Math.min(this.currentBackoff * 2, this.maxBackoff);
    return delay;
  }

  /**
   * Reset the backoff counter to the base value.
   * Call this after a successful scraping batch to indicate recovery.
   */
  resetBackoff(): void {
    this.currentBackoff = this.backoffBase;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Returns a random integer in the inclusive range [min, max]. */
  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
