import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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
  // APP_URL may list one or more comma/space-separated origins
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
    appUrl: process.env.APP_URL,
  });
}

export async function rateLimit(
  key: string,
  limit = 30,
  windowMs = 60_000,
): Promise<boolean> {
  // One shared counter per fixed window; the DB upsert is atomic across instances.
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitCounter" ("key", "windowStart", "count", "updatedAt")
    VALUES (${key}, ${windowStart}, 1, NOW())
    ON CONFLICT ("key") DO UPDATE
    SET "windowStart" = CASE WHEN "RateLimitCounter"."windowStart" < ${windowStart}
          THEN ${windowStart} ELSE "RateLimitCounter"."windowStart" END,
        "count" = CASE WHEN "RateLimitCounter"."windowStart" < ${windowStart}
          THEN 1 ELSE "RateLimitCounter"."count" + 1 END,
        "updatedAt" = NOW()
    RETURNING "count"
  `;
  // Stale keys are cheap to drop occasionally; otherwise the table grows forever.
  if (Math.random() < 0.01) {
    await prisma.rateLimitCounter.deleteMany({
      where: { windowStart: { lt: new Date(Date.now() - 86_400_000) } },
    });
  }
  return rows[0]?.count <= limit;
}

export function getClientIp(request: Request): string {
  // Only trust Vercel's own header when actually running on Vercel; elsewhere
  // a client could set it itself and get a fresh rate-limit bucket per request.
  if (process.env.VERCEL === "1") {
    const vercel = request.headers.get("x-vercel-forwarded-for");
    if (vercel) return vercel.split(",")[0].trim();
  }
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}