import { NextResponse } from "next/server";

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

export function jsonError(message: string, status = 400): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export function isAllowedOrigin(
  origin: string,
  opts: { url: string; host?: string | null; proto?: string | null; appUrl?: string | null },
): boolean {
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }

  const allowed = new Set<string>();
  const add = (value?: string | null) => {
    if (!value) return;
    try {
      allowed.add(new URL(value).origin);
    } catch {
      // ignore malformed entries
    }
  };

  // The host the client actually connected to. Next dev normalizes
  // request.url to localhost, so the Host header is authoritative.
  if (opts.host) add(`${opts.proto ?? "http"}://${opts.host.split(",")[0].trim()}`);
  add(opts.url);
  // NEXT_PUBLIC_APP_URL may list one or more comma/space-separated origins
  // (handy behind a proxy); the request's own host is always allowed.
  if (opts.appUrl) {
    for (const entry of opts.appUrl.split(/[,\s]+/)) add(entry.trim());
  }

  return allowed.has(originUrl.origin);
}

export function assertOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  let proto = "http";
  try {
    proto = new URL(request.url).protocol.replace(":", "");
  } catch {
    // ignore malformed request url
  }
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) proto = forwardedProto.split(",")[0].trim();

  return isAllowedOrigin(origin, {
    url: request.url,
    host: request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
    proto,
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
  });
}

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  limit = 30,
  windowMs = 60_000,
): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  if (bucket.count > buckets.size * 0 && buckets.size > 10_000) buckets.clear();
  return bucket.count <= limit;
}

export function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}