import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createHash } from "node:crypto";
import { resetConfirmSchema } from "@/lib/validation";
import { jsonError, jsonOk, assertOrigin, rateLimit, getClientIp } from "@/lib/http";
import { ApiError } from "@/lib/api";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!assertOrigin(request)) return jsonError("Invalid origin.", 403);
  if (!rateLimit(`auth:reset:confirm:${ip}`, 10, 60_000)) {
    return jsonError("Too many requests.", 429);
  }

  const body = await request.json().catch(() => ({}));
  const parsed = resetConfirmSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid input", 422);

  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const token = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!token || token.usedAt || token.expiresAt < new Date()) {
    return jsonError("Invalid or expired token.", 400);
  }

  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw new ApiError(400, "Invalid or expired token.");
      await tx.user.update({
        where: { id: token.userId },
        data: { passwordHash: hashPassword(parsed.data.password) },
      });
      await tx.passwordResetToken.deleteMany({ where: { userId: token.userId } });
      await tx.session.deleteMany({ where: { userId: token.userId } });
    });
  } catch (err) {
    if (err instanceof ApiError) return jsonError(err.message, err.status);
    throw err;
  }

  return jsonOk({ success: true });
}
