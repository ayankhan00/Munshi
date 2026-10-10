import { type NextRequest } from "next/server";
import { unwrapAsync, requireApiUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { jsonError } from "@/lib/http";
import { z } from "zod";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export async function POST(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
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