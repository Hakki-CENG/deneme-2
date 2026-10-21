/**
 * Rate Limiting Middleware
 * Token bucket + sliding window rate limiter for API endpoints.
 * Supports per-IP, per-user, and per-endpoint rate limits.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

export interface RateLimitConfig {
  /** Maximum requests per window */
  max: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Key generator (defaults to IP-based) */
  keyGenerator?: (request: FastifyRequest) => string;
  /** Custom error message */
  message?: string;
  /** Skip rate limiting for certain conditions */
  skip?: (request: FastifyRequest) => boolean;
  /** Headers to include in response */
  headers?: boolean;
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  maxTokens: number;
  refillRate: number; // tokens per ms
}

interface SlidingWindowEntry {
  timestamps: number[];
}

const DEFAULT_CONFIG: RateLimitConfig = {
  max: 100,
  windowMs: 60_000, // 1 minute
  message: "Too many requests, please try again later.",
  headers: true,
};

/**
 * Where rate-limit counters live.
 *
 * Extracted because the counters used to be module-level `Map`s, which meant
 * every process had its own budget. With N instances behind a load balancer a
 * client got `N * max` requests per window, and the limit silently loosened
 * every time the deployment scaled out — the opposite of what a brute-force
 * guard on `/auth` is for. The old code even carried the note
 * "production'da Redis kullanılmalı"; this is the seam that makes that
 * possible without rewriting the limiter.
 *
 * A shared implementation (Redis, Postgres, …) plugs in here. Nothing in the
 * repo depends on such a backend yet, so none is bundled: the default is
 * in-memory and correct for a single process.
 */
export interface RateLimitStore {
  consumeToken(key: string, config: RateLimitConfig): RateLimitOutcome;
  checkSlidingWindow(key: string, config: RateLimitConfig): RateLimitOutcome;
  /** Drop counters that can no longer affect a decision. */
  sweep(now?: number): void;
}

interface RateLimitOutcome {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

// Cleanup interval - eski entry'leri temizle
const CLEANUP_INTERVAL = 5 * 60_000; // 5 minutes

/** The default store: correct within one process, and nothing beyond it. */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly tokenBuckets = new Map<string, TokenBucket>();
  private readonly slidingWindows = new Map<string, SlidingWindowEntry>();
  private lastSweep = Date.now();

  sweep(now: number = Date.now()): void {
    if (now - this.lastSweep < CLEANUP_INTERVAL) return;
    this.lastSweep = now;
    for (const [key, bucket] of this.tokenBuckets) {
      if (now - bucket.lastRefill > CLEANUP_INTERVAL) this.tokenBuckets.delete(key);
    }
    for (const [key, entry] of this.slidingWindows) {
      const recent = entry.timestamps.filter((t) => now - t < CLEANUP_INTERVAL);
      if (recent.length === 0) this.slidingWindows.delete(key);
      else entry.timestamps = recent;
    }
  }

  consumeToken(key: string, config: RateLimitConfig): RateLimitOutcome {
    const now = Date.now();
    let bucket = this.tokenBuckets.get(key);

    if (!bucket) {
      bucket = {
        tokens: config.max,
        lastRefill: now,
        maxTokens: config.max,
        refillRate: config.max / config.windowMs,
      };
      this.tokenBuckets.set(key, bucket);
    }

    // Refill tokens
    const elapsed = now - bucket.lastRefill;
    bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + elapsed * bucket.refillRate);
    bucket.lastRefill = now;

    if (bucket.tokens < 1) {
      const resetMs = Math.ceil((1 - bucket.tokens) / bucket.refillRate);
      return { allowed: false, remaining: 0, resetMs };
    }

    bucket.tokens -= 1;
    const resetMs = Math.ceil((bucket.maxTokens - bucket.tokens) / bucket.refillRate);
    return { allowed: true, remaining: Math.floor(bucket.tokens), resetMs };
  }

  checkSlidingWindow(key: string, config: RateLimitConfig): RateLimitOutcome {
    const now = Date.now();
    let entry = this.slidingWindows.get(key);

    if (!entry) {
      entry = { timestamps: [] };
      this.slidingWindows.set(key, entry);
    }

    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter((t) => now - t < config.windowMs);

    if (entry.timestamps.length >= config.max) {
      const oldestInWindow = entry.timestamps[0]!;
      const resetMs = oldestInWindow + config.windowMs - now;
      return { allowed: false, remaining: 0, resetMs };
    }

    entry.timestamps.push(now);
    const remaining = config.max - entry.timestamps.length;
    return { allowed: true, remaining, resetMs: config.windowMs };
  }
}

/**
 * The store used when a caller supplies none.
 *
 * A single instance, so the previous module-level behaviour is preserved
 * exactly for every existing call site.
 */
export const defaultRateLimitStore: RateLimitStore = new InMemoryRateLimitStore();

/** Whether to trust X-Forwarded-For header — set to true ONLY behind a trusted reverse proxy */
const TRUST_PROXY = process.env.TRUST_PROXY === "true";

function getClientIp(request: FastifyRequest): string {
  // Only trust forwarded headers when explicitly configured (behind a trusted proxy)
  if (TRUST_PROXY) {
    const forwarded = request.headers["x-forwarded-for"];
    if (forwarded) {
      const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0]?.trim();
      if (ip) return ip;
    }
  }
  return request.ip || "unknown";
}

/**
 * Endpoints a user interface refreshes on a timer rather than in response to a
 * person acting. Listed explicitly and matched on the path with the query string
 * removed, because these are the routes the dashboard polls and nothing else
 * should inherit their budget by accident.
 */
const POLLED_ENDPOINTS: readonly RegExp[] = [
  /^\/health$/,
  /^\/v1\/approvals$/,
  /^\/v1\/metrics/,
  /^\/v1\/sessions$/,
];

export function isPolledEndpoint(request: FastifyRequest): boolean {
  const path = request.url.split("?")[0] ?? "";
  return POLLED_ENDPOINTS.some((pattern) => pattern.test(path));
}

export function createRateLimiter(
  config: Partial<RateLimitConfig> = {},
  store: RateLimitStore = defaultRateLimitStore,
) {
  const merged = { ...DEFAULT_CONFIG, ...config };
  const keyGen = merged.keyGenerator ?? getClientIp;

  return async function rateLimitHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (merged.skip?.(request)) return;

    store.sweep();

    const key = keyGen(request);
    const result = store.consumeToken(key, merged);

    if (merged.headers) {
      reply.header("X-RateLimit-Limit", merged.max);
      reply.header("X-RateLimit-Remaining", result.remaining);
      reply.header("X-RateLimit-Reset", Math.ceil(Date.now() + result.resetMs));
    }

    if (!result.allowed) {
      reply.header("Retry-After", Math.ceil(result.resetMs / 1000));
      await reply.code(429).send({
        error: "rate_limit_exceeded",
        message: merged.message,
        retryAfter: Math.ceil(result.resetMs / 1000),
      });
    }
  };
}

/**
 * Endpoint-specific rate limit presets
 */
export const RateLimitPresets = {
  /** General API - 100 req/min */
  general: { max: 100, windowMs: 60_000 },
  /**
   * Read-only endpoints a user interface polls on a timer.
   *
   * Kept out of the general budget rather than exempted from limiting. A client
   * that polls every second or two used to spend half the interactive budget
   * before a person had clicked anything, and an audit measured exactly that;
   * simply skipping these paths would remove the control instead of moving it.
   */
  polling: { max: 240, windowMs: 60_000 },
  /** Chat/AI endpoints - 30 req/min (more expensive) */
  chat: { max: 30, windowMs: 60_000 },
  /** Auth endpoints - 10 req/min (brute force protection) */
  auth: { max: 10, windowMs: 60_000 },
  /** File upload - 20 req/min */
  upload: { max: 20, windowMs: 60_000 },
  /** Webhook endpoints - 200 req/min (high throughput) */
  webhook: { max: 200, windowMs: 60_000 },
  /** Platform webhooks - 500 req/min */
  platformWebhook: { max: 500, windowMs: 60_000 },
} as const;

/**
 * Register rate limiting on a Fastify instance
 */
export async function registerRateLimiting(
  app: FastifyInstance,
  options: { store?: RateLimitStore } = {},
): Promise<void> {
  // Global rate limit. Pass a shared `store` when running more than one
  // instance, or each process enforces its own copy of the budget.
  //
  // Two hooks, deliberately. Polled endpoints sit in their own bucket with their
  // own ceiling, so a dashboard refreshing on a timer cannot spend the budget an
  // interactive caller needs — and the polled endpoints are still bounded, which
  // exempting them would not have been. The polling limiter uses a prefixed key:
  // both hooks would otherwise resolve to the same client IP and share one
  // bucket, which is the collision this separation exists to avoid.
  app.addHook(
    "onRequest",
    createRateLimiter({ ...RateLimitPresets.general, skip: isPolledEndpoint }, options.store),
  );
  app.addHook(
    "onRequest",
    createRateLimiter(
      {
        ...RateLimitPresets.polling,
        skip: (request) => !isPolledEndpoint(request),
        keyGenerator: (request) => `polling:${getClientIp(request)}`,
      },
      options.store,
    ),
  );
}
