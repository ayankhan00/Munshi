import { NextResponse } from "next/server";

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

export function jsonError(message: string, status = 400): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export function zodError(error: { issues: { path: (string | number)[]; message: string }[] }): NextResponse {
  const first = error.issues[0];
  const path = first.path.join(".");
  return jsonError(
    first ? `${path ? path + ": " : ""}${first.message}` : "Invalid input",
    422,
  );
}

export function assertOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const url = new URL(request.url);
  let allowed = url.origin;
  const publicUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (publicUrl) allowed = new URL(publicUrl).origin;
  return origin === allowed;
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