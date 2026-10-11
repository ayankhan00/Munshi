import { type NextRequest } from "next/server";
import { unwrapAsync, requireApiUser } from "@/lib/api";
import { aiMessageSchema } from "@/lib/validation";
import { prisma } from "@/lib/db";
import { runAssistant, createAiSession } from "@/lib/ai/assistant";

export async function POST(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const body = await request.json().catch(() => ({}));
    const parsed = aiMessageSchema.parse(body);

    let sessionId = parsed.sessionId;
    if (sessionId) {
      const session = await prisma.aiSession.findFirst({
        where: { id: sessionId, userId: user.id },
      });
      if (!session) sessionId = undefined;
    }
    if (!sessionId) {
      const session = await createAiSession(user.id, parsed.message);
      sessionId = session.id;
    }

    const result = await runAssistant(parsed.message, {
      userId: user.id,
      timezone: user.timezone,
      currency: user.currency,
      sessionId,
    });

    await prisma.aiMessage.create({
      data: {
        userId: user.id,
        sessionId,
        role: "assistant",
        content: result.reply,
        intent: result.intent,
      },
    }).catch(() => null);

    await prisma.aiSession
      .update({ where: { id: sessionId }, data: { updatedAt: new Date() } })
      .catch(() => null);

    return { ...result, sessionId };
  });
}

export async function GET(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");
    if (sessionId) {
      const session = await prisma.aiSession.findFirst({
        where: { id: sessionId, userId: user.id },
      });
      if (!session) throw new Error("Session not found");
      const messages = await prisma.aiMessage.findMany({
        where: { userId: user.id, sessionId },
        orderBy: { createdAt: "asc" },
        take: 100,
      });
      return { session, messages };
    }
    const sessions = await prisma.aiSession.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });
    return { sessions };
  });
}