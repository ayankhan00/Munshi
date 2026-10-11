import { prisma } from "@/lib/db";
import { fnAddDays, fnAddMonths, fnAddWeeks } from "@/lib/dates";
import { createTransaction } from "@/lib/services/transactions";

export const RECURRING_FREQUENCIES = ["daily", "weekly", "monthly", "yearly"] as const;

export interface RecurringInput {
  type?: string;
  amount?: number;
  description?: string;
  categoryId?: string;
  accountId?: string;
  transferAccountId?: string;
  frequency: string;
  interval?: number;
  startDate?: string;
  nextRunAt?: string;
}

interface TxTemplate {
  type: string;
  amount?: number;
  description?: string;
  categoryId?: string;
  accountId?: string;
  transferAccountId?: string;
}

function advance(date: Date, frequency: string, interval: number): Date {
  const step = interval > 0 ? interval : 1;
  switch (frequency) {
    case "daily":
      return fnAddDays(date, step);
    case "weekly":
      return fnAddWeeks(date, step);
    case "monthly":
      return fnAddMonths(date, step);
    case "yearly":
      return fnAddMonths(date, step * 12);
    default:
      return fnAddMonths(date, step);
  }
}

function resolveNextRun(input: {
  nextRunAt?: string;
  startDate?: string;
  frequency: string;
  interval?: number;
}): Date {
  if (input.nextRunAt) return new Date(input.nextRunAt);
  if (input.startDate) {
    const parsed = new Date(`${input.startDate}T00:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export async function createRecurring(userId: string, input: RecurringInput) {
  const frequency = (RECURRING_FREQUENCIES as readonly string[]).includes(input.frequency)
    ? input.frequency
    : "monthly";
  const interval = input.interval && input.interval > 0 ? Math.min(input.interval, 60) : 1;
  const type = input.type === "income" || input.type === "transfer" ? input.type : "expense";
  if (typeof input.amount !== "number" || !(input.amount > 0)) {
    throw new Error("A positive amount is required for a recurring transaction");
  }

  const template: TxTemplate = {
    type,
    amount: input.amount,
    description: input.description?.trim() || "",
    categoryId: input.categoryId,
    accountId: input.accountId,
    transferAccountId: input.transferAccountId,
  };

  return prisma.recurringRule.create({
    data: {
      userId,
      kind: "transaction",
      frequency,
      interval,
      nextRunAt: resolveNextRun({ ...input, frequency, interval }),
      template: JSON.stringify(template),
      active: true,
    },
  });
}

export async function listRecurring(userId: string) {
  const rows = await prisma.recurringRule.findMany({
    where: { userId, kind: "transaction" },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return {
    rows: rows.map((r) => ({
      ...r,
      template: safelyParse(r.template),
    })),
    total: rows.length,
  };
}

export async function updateRecurring(
  userId: string,
  id: string,
  patch: Partial<RecurringInput> & { active?: boolean },
) {
  const existing = await prisma.recurringRule.findFirst({
    where: { id, userId, kind: "transaction" },
  });
  if (!existing) throw new Error("Recurring rule not found");

  const frequency =
    patch.frequency && (RECURRING_FREQUENCIES as readonly string[]).includes(patch.frequency)
      ? patch.frequency
      : existing.frequency;
  const interval =
    patch.interval && patch.interval > 0 ? Math.min(patch.interval, 60) : existing.interval;

  const template: TxTemplate = {
    ...(safelyParse(existing.template) as unknown as TxTemplate),
  };
  if (patch.type === "income" || patch.type === "expense" || patch.type === "transfer") {
    template.type = patch.type;
  }
  if (typeof patch.amount === "number" && patch.amount > 0) template.amount = patch.amount;
  if (patch.description !== undefined) template.description = patch.description;
  if (patch.categoryId !== undefined) template.categoryId = patch.categoryId;
  if (patch.accountId !== undefined) template.accountId = patch.accountId;
  if (patch.transferAccountId !== undefined) {
    template.transferAccountId = patch.transferAccountId;
  }

  return prisma.recurringRule.update({
    where: { id },
    data: {
      frequency,
      interval,
      active: patch.active ?? existing.active,
      nextRunAt:
        patch.nextRunAt || patch.startDate
          ? resolveNextRun({
              nextRunAt: patch.nextRunAt,
              startDate: patch.startDate,
              frequency,
              interval,
            })
          : existing.nextRunAt,
      template: JSON.stringify(template),
    },
  });
}

export async function deleteRecurring(userId: string, id: string) {
  const existing = await prisma.recurringRule.findFirst({ where: { id, userId } });
  if (!existing) throw new Error("Recurring rule not found");
  await prisma.recurringRule.delete({ where: { id } });
  return { ok: true };
}

function safelyParse(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function runDueRecurringRules(now = new Date()) {
  const rules = await prisma.recurringRule.findMany({
    where: { active: true, kind: "transaction", nextRunAt: { lte: now } },
    orderBy: { nextRunAt: "asc" },
    take: 100,
  });

  let created = 0;
  for (const rule of rules) {
    const template = safelyParse(rule.template) as unknown as TxTemplate;
    let next = rule.nextRunAt;
    let guard = 0;
    while (next <= now && guard < 60) {
      if (typeof template.amount === "number" && template.amount > 0) {
        try {
          await createTransaction(rule.userId, {
            type: template.type as "income" | "expense" | "transfer",
            amount: template.amount,
            description: template.description,
            categoryId: template.categoryId,
            accountId: template.accountId,
            transferAccountId: template.transferAccountId,
            date: next.toISOString().slice(0, 10),
            idempotencyKey: `recurring:${rule.id}:${next.getTime()}`,
            recurringRuleId: rule.id,
          });
          created += 1;
        } catch {
          // skip an occurrence that fails (e.g. archived account)
        }
      }
      next = advance(next, rule.frequency, rule.interval);
      guard += 1;
    }
    await prisma.recurringRule.update({
      where: { id: rule.id },
      data: { nextRunAt: next },
    });
  }

  return { rules: rules.length, created };
}
