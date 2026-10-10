import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { randomBytes, createHash } from "node:crypto";
import { resetRequestSchema, resetConfirmSchema } from "@/lib/validation";
import { jsonError, jsonOk, assertOrigin, rateLimit, getClientIp } from "@/lib/http";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const url = new URL(request.url);
  const action = url.pathname.endsWith("reset") ? "confirm" : "request";

  if (!assertOrigin(request)) return jsonError("Invalid origin.", 403);
  if (action === "request") {
    if (!rateLimit(`auth:reset:${ip}`, 5, 60_000)) return jsonError("Too many requests.", 429);
  }

  const body = await request.json().catch(() => ({}));
  if (action === "request") {
    const parsed = resetRequestSchema.safeParse(body);
    if (!parsed.success) return jsonError("Invalid input", 422);
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
    if (user) {
      const raw = randomBytes(32).toString("base64url");
      const tokenHash = createHash("sha256").update(raw).digest("hex");
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 30 * 60_000),
        },
      });
    }
    return jsonOk({ message: "If that email exists, a reset link was generated in dev." }, 200);
  }

  const parsed = resetConfirmSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid input", 422);
  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const token = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  });
  if (!token || token.usedAt || token.expiresAt < new Date()) return jsonError("Invalid or expired token.", 400);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: token.userId },
      data: { passwordHash: hashPassword(parsed.data.password) },
    });
    await tx.passwordResetToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    });
  });

  return jsonOk({ success: true });
}