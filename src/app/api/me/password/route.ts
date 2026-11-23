import { type NextRequest } from "next/server";
import { unwrapAsync, requireApiUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { jsonError, rateLimit } from "@/lib/http";
import { passwordSchema } from "@/lib/validation";
import { z } from "zod";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export async function POST(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    if (!(await rateLimit(`password:change:${user.id}`, 5, 60_000))) {
      return jsonError("Too many attempts. Try again later.", 429);
    }
    const body = await request.json().catch(() => ({}));
    const parsed = changePasswordSchema.parse(body);
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser || !verifyPassword(parsed.currentPassword, dbUser.passwordHash)) {
      return jsonError("Current password is incorrect.", 403);
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(parsed.newPassword) },
    });
    return { ok: true };
  });
}