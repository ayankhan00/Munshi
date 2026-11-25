import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { randomBytes, createHash } from "node:crypto";
import { resetRequestSchema } from "@/lib/validation";
import { jsonError, jsonOk, assertOrigin, rateLimit, getClientIp } from "@/lib/http";
import { mailConfigured, sendPasswordResetEmail } from "@/lib/mail";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!assertOrigin(request)) return jsonError("Invalid origin.", 403);
  if (!(await rateLimit(`auth:reset:${ip}`, 5, 60_000))) {
    return jsonError("Too many requests.", 429);
  }

  const body = await request.json().catch(() => ({}));
  const parsed = resetRequestSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid input", 422);

  const email = parsed.data.email.toLowerCase();
  if (!(await rateLimit(`auth:reset:email:${email}`, 2, 60_000))) {
    return jsonError("Too many requests.", 429);
  }

  const user = await prisma.user.findUnique({ where: { email } });

  let devToken: string | undefined;
  if (user) {
    // Older links must stop working once a new reset is requested.
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    const raw = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(raw).digest("hex");
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });
    if (mailConfigured()) {
      try {
        await sendPasswordResetEmail(user.email, raw);
      } catch (err) {
        console.error("Password reset email failed", err);
        if (process.env.NODE_ENV !== "production") devToken = raw;
      }
    } else if (process.env.NODE_ENV !== "production") {
      // Keep the local no-email workflow, but never hand out a token in production.
      devToken = raw;
    }
  }

  return jsonOk({
    message: "If that email exists, a reset link has been sent.",
    devToken,
  });
}
