import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { randomBytes, createHash } from "node:crypto";
import { resetRequestSchema } from "@/lib/validation";
import { jsonError, jsonOk, assertOrigin, rateLimit, getClientIp } from "@/lib/http";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!assertOrigin(request)) return jsonError("Invalid origin.", 403);
  if (!rateLimit(`auth:reset:${ip}`, 5, 60_000)) {
    return jsonError("Too many requests.", 429);
  }

  const body = await request.json().catch(() => ({}));
  const parsed = resetRequestSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid input", 422);

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });

  let devToken: string | undefined;
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
    // No mail provider in this environment: surface the token in dev only.
    if (process.env.NODE_ENV !== "production") devToken = raw;
  }

  return jsonOk({
    message: "If that email exists, a reset link has been sent.",
    devToken,
  });
}
