import { prisma } from "@/lib/db";
import { parseIntentWithContext, type ChatHistoryTurn } from "./parser";
import { planWithGemini, type GeminiAction, type RecentTransaction } from "./gemini";
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

async function loadContext(userId: string): Promise<{
  categories: { name: string; kind: string }[];
  recent: RecentTransaction[];
}> {
  const [categories, recent] = await Promise.all([
    prisma.category.findMany({
      where: { userId, archived: false },
      select: { name: true, kind: true },
      orderBy: { name: "asc" },
    }),
    prisma.transaction.findMany({
      where: { userId, deletedAt: null },
      orderBy: { occurredAt: "desc" },
      take: 5,
      select: {
        id: true,
        amountMinor: true,
        type: true,
        description: true,
        occurredAt: true,
        category: { select: { name: true } },
      },
    }),
  ]);

  return {
    categories,
    recent: recent.map((t) => ({
      id: t.id,
      amount: t.amountMinor / 100,
      type: t.type,
      category: t.category?.name ?? "",
      description: t.description ?? "",
      date: t.occurredAt.toISOString().slice(0, 10),
    })),
  };
}

function normalizeActionType(type: string): string {
  const value = (type ?? "").toLowerCase().trim();
  if (value === "expense" || value === "spend") return "create_expense";
  if (value === "income") return "create_income";
  if (value === "transfer") return "create_transfer";
  if (value === "update" || value === "edit" || value === "modify") {
    return "update_transaction";
  }
  return value;
}

function actionToIntent(action: GeminiAction, raw: string): ParsedIntent | null {
  const kind = normalizeActionType(action.type);
  switch (kind) {
    case "create_expense":
      return {
        kind: "create_expense",
        amount: action.amount,
        categoryName: action.categoryName,
        description: action.description,
        date: action.date,
        raw,
      };
    case "create_income":
      return {
        kind: "create_income",
        amount: action.amount,
        categoryName: action.categoryName,
        description: action.description,
        date: action.date,
        raw,
      };
    case "create_transfer":
      return {
        kind: "create_transfer",
        amount: action.amount,
        fromAccount: action.fromAccount,
        toAccount: action.toAccount,
        raw,
      };
    case "query_balance":
      return { kind: "query_balance", raw };
    case "query_spending":
      return { kind: "query_spending", period: action.period, raw };
    case "query_income":
      return { kind: "query_income", period: action.period, raw };
    case "create_task":
      return {
        kind: "create_task",
        title: action.title,
        due: action.due,
        priority: action.priority,
        raw,
      };
    case "create_reminder":
      return {
        kind: "create_reminder",
        title: action.title,
        remind: action.remind,
        raw,
      };
    case "update_transaction":
      return {
        kind: "update_transaction",
        targetTransactionId: action.targetTransactionId,
        amount: action.changes?.amount ?? action.amount,
        categoryName: action.changes?.categoryName ?? action.categoryName,
        description: action.changes?.description ?? action.description,
        date: action.changes?.date ?? action.date,
        raw,
      };
    case "help":
      return { kind: "help", raw };
    default:
      return null;
  }
}

const CORRECTION_RE =
  /\b(instead|actually|change|correct|update|fix|mistake|wrong|should be|make it|rather|not)\b/i;

function intentsFromPlan(
  plan: { actions: GeminiAction[] } | null,
  message: string,
  history: ChatHistoryTurn[] | undefined,
): { intents: ParsedIntent[]; usedGemini: boolean } {
  const intents: ParsedIntent[] = [];
  const seen = new Set<string>();
  for (const action of plan?.actions ?? []) {
    const intent = actionToIntent(action, message);
    if (!intent) continue;
    const key = JSON.stringify(intent);
    if (seen.has(key)) continue;
    seen.add(key);
    intents.push(intent);
  }

  if (intents.length > 0) {
    const hasCreate = intents.some(
      (i) => i.kind === "create_expense" || i.kind === "create_income",
    );
    const hasUpdate = intents.some((i) => i.kind === "update_transaction");
    if (hasCreate && hasUpdate) {
      // A single utterance should not both create and modify. Treat it as a
      // correction only when the user clearly asked to change something.
      return {
        intents: CORRECTION_RE.test(message)
          ? intents.filter((i) => i.kind === "update_transaction")
          : intents.filter((i) => i.kind !== "update_transaction"),
        usedGemini: true,
      };
    }
    return { intents, usedGemini: true };
  }

  return {
    intents: [parseIntentWithContext(message, history ?? [])],
    usedGemini: false,
  };
}

async function executeIntents(
  intents: ParsedIntent[],
  ctx: ExecutorContext,
): Promise<Omit<AssistantResult, "usedGemini" | "sessionId">> {
  const results: ExecutorResult[] = [];
  for (const intent of intents) {
    try {
      results.push(await executeIntent(intent, ctx));
    } catch (err) {
      results.push({
        reply: err instanceof Error ? err.message : "Something went wrong.",
        intent: intent.kind,
      });
    }
  }

  const reply = results.map((r) => r.reply).join("\n\n");
  const single = results.length === 1;
  return {
    reply,
    intent: single ? results[0]?.intent ?? "unknown" : "multi",
    action: single ? results[0]?.action : undefined,
    data: single ? results[0]?.data : results.map((r) => r.data),
  };
}

export async function runAssistant(
  message: string,
  ctx: AssistantContext,
): Promise<AssistantResult> {
  const { categories, recent } = await loadContext(ctx.userId);
  const plan = await planWithGemini(
    { text: message },
    { currency: ctx.currency, categories, recentTransactions: recent },
  );
  const { intents, usedGemini } = intentsFromPlan(plan, message, ctx.history);
  const result = await executeIntents(intents, ctx);
  return { ...result, usedGemini, sessionId: ctx.sessionId };
}

export async function runVoiceAssistant(
  audio: { mimeType: string; data: string },
  ctx: AssistantContext,
): Promise<AssistantResult & { transcript: string }> {
  const { categories, recent } = await loadContext(ctx.userId);
  const plan = await planWithGemini(
    { audio },
    { currency: ctx.currency, categories, recentTransactions: recent },
  );
  const transcript = (plan?.transcript ?? "").trim();
  if (!transcript) {
    throw new Error("Could not hear anything. Please try again.");
  }
  const { intents, usedGemini } = intentsFromPlan(plan, transcript, ctx.history);
  const result = await executeIntents(intents, ctx);
  return { ...result, usedGemini, sessionId: ctx.sessionId, transcript };
}

export async function persistTurn(
  userId: string,
  sessionId: string,
  userText: string,
  result: AssistantResult,
): Promise<void> {
  await prisma.aiMessage
    .create({
      data: {
        userId,
        sessionId,
        role: "user",
        content: userText,
        intent: result.intent,
        payload: JSON.stringify({ usedGemini: result.usedGemini }),
      },
    })
    .catch(() => null);
  await prisma.aiMessage
    .create({
      data: {
        userId,
        sessionId,
        role: "assistant",
        content: result.reply,
        intent: result.intent,
      },
    })
    .catch(() => null);
}

export async function createAiSession(userId: string, firstMessage: string) {
  const session = await prisma.aiSession.create({
    data: { userId, title: firstMessage.slice(0, 80) },
  });
  return session;
}
