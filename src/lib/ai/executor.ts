import { prisma } from "@/lib/db";
import { createTransaction, getCurrentBalance } from "@/lib/services/transactions";
import { categoryBreakdown } from "@/lib/services/reports";
import { createTask, listTasks } from "@/lib/services/tasks";
import { createReminder } from "@/lib/services/reminders";
import { currentMonthKey, formatDateTime, dateKey } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { parseNaturalDateTime } from "@/lib/dates";
import type { ParsedIntent } from "./types";

export interface ExecutorContext {
  userId: string;
  timezone: string;
  currency: string;
}

export interface ExecutorResult {
  reply: string;
  intent: string;
  action?: "transaction" | "task" | "reminder";
  data?: unknown;
}

export async function executeIntent(intent: ParsedIntent, ctx: ExecutorContext): Promise<ExecutorResult> {
  switch (intent.kind) {
    case "create_expense":
      return executeExpense(intent, ctx);
    case "create_income":
      return executeExpense(intent, ctx);
    case "create_transfer":
      return executeTransfer(intent, ctx);
    case "query_balance":
      return executeBalance(ctx);
    case "query_spending":
      return executeSpending(ctx);
    case "query_income":
      return executeIncome(ctx);
    case "create_task":
      return executeTask(intent, ctx);
    case "create_reminder":
      return executeReminder(intent, ctx);
    case "help":
      return {
        reply: "I can help you with:\n" +
          "• Add expense/income: \"Add expense 500 for lunch\" or \"Salary received 150000\"\n" +
          "• Check balance: \"What is my balance?\"\n" +
          "• Spending: \"How much did I spend this month?\"\n" +
          "• Tasks: \"Add task pay electricity bill by tomorrow\"\n" +
          "• Reminders: \"Remind me to call mom at 6pm\"",
        intent: intent.kind,
      };
    case "unknown":
      return {
        reply: "I didn't understand that. Try \"Add expense 500 for lunch\" or \"What is my balance?\"",
        intent: intent.kind,
      };
    default:
      return { reply: "I'm not sure how to help with that yet.", intent: "unknown" };
  }
}

async function executeExpense(
  intent: Extract<ParsedIntent, { kind: "create_expense" | "create_income" }>,
  ctx: ExecutorContext,
): Promise<ExecutorResult> {
  if (!intent.amount) {
    return {
      reply: `I couldn't find an amount. Please say the amount, e.g. "Add expense 500 for lunch".`,
      intent: intent.kind,
    };
  }

  const type = intent.kind === "create_expense" ? "expense" : "income";
  const date = intentMappedDate(intent.date, ctx.timezone);

  const result = await createTransaction(ctx.userId, {
    type,
    amount: intent.amount,
    categoryName: intent.categoryName,
    description: intent.description ?? "",
    notes: "",
    date,
  }).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : "Failed to create transaction";
    throw new Error(message);
  });

  const tx = result.transaction as { type: string; amountMinor: number; description?: string | null };
  const label = type === "expense" ? "expense" : "income";
  const preposition = type === "expense" ? "for" : "from";
  return {
    reply: `Done! Recorded ${label} of ${formatMoney(tx.amountMinor, ctx.currency)}${tx.description ? ` ${preposition} ${tx.description}` : ""}.`,
    intent: intent.kind,
    action: "transaction",
    data: result,
  };
}

export function intentMappedDate(date?: string, tz?: string, now = new Date()): string | undefined {
  if (!date || !tz) return undefined;
  const parsed = parseNaturalDateTime(date, tz, now);
  return parsed ? dateKey(parsed.date, tz) : undefined;
}

async function executeBalance(ctx: ExecutorContext): Promise<ExecutorResult> {
  const balance = await getCurrentBalance(ctx.userId);
  return {
    reply: `Your available balance is ${formatMoney(balance.availableMinor, ctx.currency)}.`,
    intent: "query_balance",
    data: balance,
  };
}

async function executeSpending(ctx: ExecutorContext): Promise<ExecutorResult> {
  const monthKey = currentMonthKey(ctx.timezone);
  const breakdown = await categoryBreakdown(ctx.userId, ctx.timezone, 1, [monthKey]);
  const formatted = formatMoney(breakdown.totalExpenseMinor, ctx.currency);
  if (breakdown.categories.length === 0) {
    return {
      reply: `You haven't spent anything this month (${monthKey}).`,
      intent: "query_spending",
      data: breakdown,
    };
  }
  const top = breakdown.categories[0];
  return {
    reply: `You spent ${formatted} this month. Top category: ${top.name} (${formatMoney(top.minor, ctx.currency)}).`,
    intent: "query_spending",
    data: breakdown,
  };
}

async function executeIncome(ctx: ExecutorContext): Promise<ExecutorResult> {
  const monthKey = currentMonthKey(ctx.timezone);
  const breakdown = await categoryBreakdown(ctx.userId, ctx.timezone, 1, [monthKey]);
  return {
    reply: `You earned ${formatMoney(breakdown.totalIncomeMinor, ctx.currency)} this month.`,
    intent: "query_income",
    data: breakdown,
  };
}

async function executeTransfer(
  intent: Extract<ParsedIntent, { kind: "create_transfer" }>,
  ctx: ExecutorContext,
): Promise<ExecutorResult> {
  if (!intent.amount) {
    return { reply: "Please include an amount to transfer.", intent: intent.kind };
  }
  const accounts = await prisma.account.findMany({
    where: { userId: ctx.userId, archived: false },
  });
  if (accounts.length < 2) {
    return {
      reply: "You need at least two accounts to make a transfer. Create another account in Settings.",
      intent: intent.kind,
    };
  }

  const from = intent.fromAccount
    ? accounts.find((a) => a.name.toLowerCase().includes(intent.fromAccount!.toLowerCase()))
    : undefined;
  const to = intent.toAccount
    ? accounts.find((a) => a.name.toLowerCase().includes(intent.toAccount!.toLowerCase()))
    : undefined;

  const fromId = from?.id ?? accounts.find((a) => a.isDefault)?.id ?? accounts[0].id;
  const toId = to?.id ?? accounts.find((a) => a.id !== fromId)?.id;

  if (!toId || toId === fromId) {
    return {
      reply: `I couldn't figure out the destination account. Available accounts: ${accounts.map((a) => a.name).join(", ")}.`,
      intent: intent.kind,
    };
  }

  const result = await createTransaction(ctx.userId, {
    type: "transfer",
    amount: intent.amount,
    accountId: fromId,
    transferAccountId: toId,
    description: `Transfer to ${accounts.find((a) => a.id === toId)?.name}`,
    notes: "",
  });

  const tx = result.transaction as { amountMinor: number };
  return {
    reply: `Transferred ${formatMoney(tx.amountMinor, ctx.currency)}.`,
    intent: intent.kind,
    action: "transaction",
    data: result,
  };
}

async function executeTask(
  intent: Extract<ParsedIntent, { kind: "create_task" }>,
  ctx: ExecutorContext,
): Promise<ExecutorResult> {
  if (!intent.title) {
    return { reply: "What task would you like to add?", intent: intent.kind };
  }
  const task = await createTask(
    ctx.userId,
    {
      title: intent.title,
      due: intent.due,
      priority: intent.priority ?? "medium",
    },
    ctx.timezone,
  );

  const dueText = task.dueAt ? ` (due ${formatDateTime(task.dueAt, ctx.timezone)})` : "";
  return {
    reply: `Task added: "${task.title}"${dueText}.`,
    intent: intent.kind,
    action: "task",
    data: task,
  };
}

async function executeReminder(
  intent: Extract<ParsedIntent, { kind: "create_reminder" }>,
  ctx: ExecutorContext,
): Promise<ExecutorResult> {
  if (!intent.title) {
    return { reply: "What should I remind you about?", intent: intent.kind };
  }
  const result = await createReminder(ctx.userId, {
    title: intent.title,
    remind: intent.remind,
    timezone: ctx.timezone,
  }, ctx.timezone);

  if (result.duplicate) {
    return {
      reply: `You already have a reminder for "${intent.title}" at roughly the same time.`,
      intent: intent.kind,
      data: result,
    };
  }

  const reminder = result.reminder;
  return {
    reply: `Reminder set: "${reminder.title}" at ${formatDateTime(reminder.remindAt, ctx.timezone)}.`,
    intent: intent.kind,
    action: "reminder",
    data: result,
  };
}

export async function agendaForUser(ctx: ExecutorContext) {
  const rows = await listTasks(ctx.userId, { status: "pending", pageSize: 5 });
  const first = rows.rows[0];
  return {
    reply: first
      ? `You have ${rows.total} open tasks. Next: "${first.title}"${first.dueAt ? ` due ${formatDateTime(first.dueAt, ctx.timezone)}` : ""}.`
      : "You have no pending tasks. Enjoy your day!",
    intent: "query_tasks",
    data: rows,
  };
}