import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, deleteSession } from "@/lib/auth/sessions";
import { registerSchema, loginSchema, resetRequestSchema, resetConfirmSchema } from "@/lib/validation";
import { jsonError, jsonOk, assertOrigin, rateLimit, getClientIp } from "@/lib/http";
import { env } from "@/lib/env";
import { randomBytes } from "node:crypto";

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
  if (!rateLimit(`auth:register:${ip}`, 10, 60_000)) return jsonError("Too many attempts. Try again later.", 429);
  if (!assertOrigin(request)) return jsonError("Invalid origin.", 403);

  const body = await request.json().catch(() => ({}));
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return jsonError(first ? first.message : "Invalid input", 422);
  }
  const { email, password, name } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) return jsonError("An account with that email already exists.", 409);

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash: hashPassword(password),
      name: name || null,
      openingBalanceMinor: 0,
    },
  });

  await prisma.account.create({ data: { userId: user.id, name: "Cash", type: "cash", isDefault: true } });
  await prisma.category.findFirst({ where: { userId: user.id } }).then(async (c) => {
    if (!c) {
      const { DEFAULT_CATEGORIES } = await import("@/lib/categories");
      await prisma.category.createMany({
        data: DEFAULT_CATEGORIES.map((x) => ({ ...x, userId: user.id, isSystem: true })),
      });
    }
  });

  const token = await createSession(user.id, request.headers.get("user-agent") ?? undefined);
  const res = jsonOk({ user: { id: user.id, email: user.email } }, 201);
  setSessionCookie(res, token);
  return res;
}