import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, deleteSession } from "@/lib/auth/sessions";
import { loginSchema } from "@/lib/validation";
import { jsonError, jsonOk, assertOrigin, rateLimit, getClientIp } from "@/lib/http";
import { env } from "@/lib/env";

function setSessionCookie(res: NextResponse, token: string) {
  const tenDays = 10 * 24 * 60 * 60;
  res.cookies.set(env().sessionCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: tenDays,
  });
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!rateLimit(`auth:login:${ip}`, 20, 60_000)) return jsonError("Too many attempts. Try again later.", 429);
  if (!assertOrigin(request)) return jsonError("Invalid origin.", 403);

  const body = await request.json().catch(() => ({}));
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return jsonError(first ? first.message : "Invalid input", 422);
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return jsonError("Invalid email or password.", 401);
  }

  const token = await createSession(user.id, request.headers.get("user-agent") ?? undefined);
  const res = jsonOk({ user: { id: user.id, email: user.email } });
  setSessionCookie(res, token);
  return res;
}