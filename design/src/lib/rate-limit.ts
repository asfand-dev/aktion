/**
 * Small in-memory sliding-window rate limiter for auth endpoints. Per
 * server instance — for multi-instance deployments swap in a Redis-backed
 * limiter behind the same interface.
 */
const buckets = new Map<string, number[]>();

export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const cutoff = now - windowMs;
  const hits = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  if (hits.length >= limit) {
    const retryAfterSeconds = Math.ceil((hits[0] + windowMs - now) / 1000);
    buckets.set(key, hits);
    return { ok: false, retryAfterSeconds };
  }
  hits.push(now);
  buckets.set(key, hits);
  // Opportunistic cleanup so the map never grows unbounded.
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => t <= cutoff)) buckets.delete(k);
    }
  }
  return { ok: true, retryAfterSeconds: 0 };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : "local";
}
