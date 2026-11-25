import { type NextRequest } from "next/server";
import { unwrapAsync, requireApiUser, ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/http";
import {
  runVoiceAssistant,
  createAiSession,
  persistTurn,
} from "@/lib/ai/assistant";

const AUDIO_MIME_TYPES = new Set([
  "audio/webm",
  "audio/wav",
  "audio/x-wav",
  "audio/mp3",
  "audio/mpeg",
  "audio/ogg",
  "audio/mp4",
]);
const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const MAX_AUDIO_CHARS = Math.ceil(MAX_AUDIO_BYTES / 3) * 4;

export async function POST(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    if (!(await rateLimit(`ai:${user.id}`, 30, 60_000))) throw new ApiError(429, "Too many requests.");
    if (!(await rateLimit(`ai:${user.id}:day`, 200, 86_400_000))) {
      throw new ApiError(429, "Daily AI limit reached.");
    }
    if (!(await rateLimit("ai:global:day", 5000, 86_400_000))) {
      throw new ApiError(429, "Daily AI limit reached.");
    }
    const body = await request.json().catch(() => ({}));
    const audio = typeof body.audio === "string" ? body.audio : "";
    const mimeType =
      typeof body.mimeType === "string" && body.mimeType
        ? body.mimeType.split(";")[0].trim().toLowerCase()
        : "audio/wav";
    const requestedSessionId =
      typeof body.sessionId === "string" && body.sessionId
        ? body.sessionId
        : undefined;

    if (!audio) throw new ApiError(422, "audio is required");
    if (!AUDIO_MIME_TYPES.has(mimeType)) throw new ApiError(415, "Unsupported audio format");
    if (audio.length > MAX_AUDIO_CHARS) throw new ApiError(413, "Recording is too long");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(audio) || audio.length % 4 !== 0) {
      throw new ApiError(422, "audio must be base64");
    }
    if (Buffer.from(audio, "base64").length > MAX_AUDIO_BYTES) {
      throw new ApiError(413, "Recording is too long");
    }

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
