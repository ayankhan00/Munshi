import { type NextRequest } from "next/server";
import { unwrapAsync, requireApiUser, ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import {
  runVoiceAssistant,
  createAiSession,
  persistTurn,
} from "@/lib/ai/assistant";

const MAX_AUDIO_CHARS = 8_000_000;

export async function POST(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const body = await request.json().catch(() => ({}));
    const audio = typeof body.audio === "string" ? body.audio : "";
    const mimeType =
      typeof body.mimeType === "string" && body.mimeType
        ? body.mimeType
        : "audio/wav";
    const requestedSessionId =
      typeof body.sessionId === "string" && body.sessionId
        ? body.sessionId
        : undefined;

    if (!audio) throw new ApiError(422, "audio is required");
    if (audio.length > MAX_AUDIO_CHARS) throw new ApiError(413, "Recording is too long");

    let sessionId = requestedSessionId;
    if (sessionId) {
      const session = await prisma.aiSession.findFirst({
        where: { id: sessionId, userId: user.id },
      });
      if (!session) sessionId = undefined;
    }

    let history: { role: "user" | "assistant"; content: string; intent?: string }[] = [];
    if (sessionId) {
      const recent = await prisma.aiMessage.findMany({
        where: { userId: user.id, sessionId },
        orderBy: { createdAt: "desc" },
        take: 2,
      });
      history = recent.reverse().map((m) => ({
        role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
        content: m.content,
        intent: m.intent ?? undefined,
      }));
    }

    let result: Awaited<ReturnType<typeof runVoiceAssistant>>;
    try {
      result = await runVoiceAssistant(
        { mimeType, data: audio },
        {
          userId: user.id,
          timezone: user.timezone,
          currency: user.currency,
          sessionId,
          history,
        },
      );
    } catch (err) {
      throw new ApiError(
        422,
        err instanceof Error ? err.message : "Could not process the recording.",
      );
    }

    if (!sessionId) {
      const session = await createAiSession(user.id, result.transcript);
      sessionId = session.id;
    }

    await persistTurn(user.id, sessionId, result.transcript, result);
    await prisma.aiSession
      .update({ where: { id: sessionId }, data: { updatedAt: new Date() } })
      .catch(() => null);

    return { ...result, sessionId };
  });
}
