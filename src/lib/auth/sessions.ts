import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  userId: string,
  userAgent?: string,
): Promise<string> {
  const token = newSessionToken();
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      userAgent,
    },
  });
  return token;
}

export async function getSessionUser(
  token: string,
): Promise<{ id: string; email: string } | null> {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user) return null;
  if (session.expiresAt.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000) {
    await prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() + SESSION_DURATION_MS) },
    });
  }
  return session.user;
}

export async function deleteSession(token: string): Promise<void> {
  if (!token) return;
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}