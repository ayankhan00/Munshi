import { prisma } from "@/lib/db";
import { extractAmountInfo, type AmountInfo } from "@/lib/money";
import { parseIntentWithContext, isFollowUpMessage, type ChatHistoryTurn } from "./parser";
import { extractWithGemini, type GeminiExtraction } from "./gemini";
import { executeIntent, type ExecutorContext, type ExecutorResult } from "./executor";
import type { ParsedIntent } from "./types";

export interface AssistantContext extends ExecutorContext {
  sessionId?: string;
  userId: string;
  timezone: string;
  currency: string;
  history?: ChatHistoryTurn[];
}

export interface AssistantResult {
  reply: string;
  intent: string;
  action?: ExecutorResult["action"];
  data?: unknown;
  usedGemini: boolean;
  sessionId?: string;
}

const ALLOWED_KINDS = new Set([
  "create_expense",
  "create_income",
  "create_transfer",
  "query_balance",
  "query_spending",
  "query_income",
  "create_task",
  "create_reminder",
  "help",
  "unknown",
]);

// The model must never be the source of truth for an amount. When the message
// contains a spoken compound number (e.g. "500 73" from "five hundred and
// seventy three"), the deterministic parser's summed value wins over the model.
function preferDeterministicAmount(
  geminiIntent: ParsedIntent,
  amount: AmountInfo,
): ParsedIntent {
  if (!amount.compound || typeof amount.value !== "number") {
    return geminiIntent;
  }
  switch (geminiIntent.kind) {
    case "create_expense":
    case "create_income":
    case "create_transfer":
      return { ...geminiIntent, amount: amount.value };
    default:
      return geminiIntent;
  }
}

function toIntent(extraction: GeminiExtraction, raw: string): ParsedIntent {
  const base = { raw };
  if (!ALLOWED_KINDS.has(extraction.kind)) {
    return { kind: "unknown", ...base };
  }
  switch (extraction.kind) {
    case "create_expense":
      return { kind: "create_expense", amount: extraction.amount, categoryName: extraction.categoryName, description: extraction.description, date: extraction.date, ...base };
    case "create_income":
      return { kind: "create_income", amount: extraction.amount, categoryName: extraction.categoryName, description: extraction.description, date: extraction.date, ...base };
    case "create_transfer":
      return { kind: "create_transfer", amount: extraction.amount, fromAccount: extraction.fromAccount, toAccount: extraction.toAccount, ...base };
    case "query_balance":
      return { kind: "query_balance", ...base };
    case "query_spending":
      return { kind: "query_spending", period: extraction.period, ...base };
    case "query_income":
      return { kind: "query_income", period: extraction.period, ...base };
    case "create_task":
      return { kind: "create_task", title: extraction.title, due: extraction.due, priority: extraction.priority, ...base };
    case "create_reminder":
      return { kind: "create_reminder", title: extraction.title, remind: extraction.remind, ...base };
    case "help":
      return { kind: "help", ...base };
    default:
      return { kind: "unknown", ...base };
  }
}

export async function runAssistant(message: string, ctx: AssistantContext): Promise<AssistantResult> {
  let usedGemini = false;
  const history = ctx.history ?? [];
  const followUp = isFollowUpMessage(message, history);
  let intent: ParsedIntent = parseIntentWithContext(message, history);

  // Only the current message is ever sent to the model. Follow-ups and
  // corrections are resolved locally from the previous turn's stored intent.
  if (!followUp) {
    // Give the model the user's real categories so it picks an existing one
    // (exact name) instead of inventing near-duplicates like "Food".
    const categories = await prisma.category.findMany({
      where: { userId: ctx.userId, archived: false },
      select: { name: true, kind: true },
      orderBy: { name: "asc" },
    });
    const extraction = await extractWithGemini(message, [], {
      currency: ctx.currency,
      categories,
    });
    if (extraction) {
      usedGemini = true;
      const geminiIntent = toIntent(extraction, message);
      if (geminiIntent.kind !== "unknown" || intent.kind === "unknown") {
        intent = preferDeterministicAmount(geminiIntent, extractAmountInfo(message));
      }
    }
  }

  const result = await executeIntent(intent, ctx);

  const payload = {
    sessionId: ctx.sessionId ?? "",
    userId: ctx.userId,
    role: "user" as const,
    content: message,
    intent: intent.kind,
    payload: JSON.stringify({ usedGemini }),
  };
  if (ctx.sessionId) {
    await prisma.aiMessage.create({ data: payload }).catch(() => null);
  }

  return {
    reply: result.reply,
    intent: result.intent,
    action: result.action,
    data: result.data,
    usedGemini,
    sessionId: ctx.sessionId,
  };
}

export async function createAiSession(userId: string, firstMessage: string) {
  const session = await prisma.aiSession.create({
    data: { userId, title: firstMessage.slice(0, 80) },
  });
  return session;
}