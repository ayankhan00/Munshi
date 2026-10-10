import { prisma } from "@/lib/db";
import { toMinor } from "@/lib/money";
import { monthRange, currentMonthKey } from "@/lib/dates";

export interface BudgetInput {
  categoryId?: string;
  amount: number;
  period?: string;
  rollover?: boolean;
}

export async function setBudget(userId: string, input: BudgetInput) {
  const period = input.period ?? currentMonthKey("UTC");
  if (input.categoryId) {
    const cat = await prisma.category.findFirst({
      where: { id: input.categoryId, userId },
    });
    if (!cat) throw new Error("Category not found");
  }
  const amountMinor = toMinor(input.amount);
  const rollover = input.rollover ?? false;

  if (input.categoryId) {
    return prisma.budget.upsert({
      where: {
        userId_categoryId_period: {
          userId,
          categoryId: input.categoryId,
          period,
        },
      },
      create: { userId, categoryId: input.categoryId, period, amountMinor, rollover },
      update: { amountMinor, rollover },
    });
  }

  // SQLite treats NULL as distinct in unique indexes, so the composite unique
  // key cannot be used to upsert an "overall" (category-less) budget. Handle it
  // with an explicit find-then-write.
  const existing = await prisma.budget.findFirst({
    where: { userId, categoryId: null, period },
  });
  if (existing) {
    return prisma.budget.update({
      where: { id: existing.id },
      data: { amountMinor, rollover },
    });
  }
  return prisma.budget.create({
    data: { userId, categoryId: null, period, amountMinor, rollover },
  });
}

export async function deleteBudget(userId: string, id: string) {
  const budget = await prisma.budget.findFirst({ where: { id, userId } });
  if (!budget) throw new Error("Budget not found");
  await prisma.budget.delete({ where: { id } });
  return { ok: true };
}

export async function listBudgets(userId: string, tz: string, startDay: number, period?: string) {
  const key = period ?? currentMonthKey(tz);
  const range = monthRange(key, tz, startDay);
  const budgets = await prisma.budget.findMany({
    where: { userId, period: key },
    include: { category: true },
    orderBy: { createdAt: "asc" },
  });

  const txns = await prisma.transaction.findMany({
    where: {
      userId,
      type: "expense",
      deletedAt: null,
      occurredAt: { gte: range.start, lt: range.endExclusive },
    },
  });

  const byCategory = new Map<string, number>();
  let totalExpense = 0;
  for (const t of txns) {
    totalExpense += t.amountMinor;
    if (t.categoryId) {
      byCategory.set(t.categoryId, (byCategory.get(t.categoryId) ?? 0) + t.amountMinor);
    }
  }

  const rows = budgets.map((b) => {
    const spent = b.categoryId ? (byCategory.get(b.categoryId) ?? 0) : totalExpense;
    return {
      id: b.id,
      categoryId: b.categoryId,
      categoryName: b.category?.name ?? "Overall",
      categoryColor: b.category?.color,
      amountMinor: b.amountMinor,
      spentMinor: spent,
      remainingMinor: b.amountMinor - spent,
      overspentMinor: Math.max(0, spent - b.amountMinor),
      percentUsed: b.amountMinor > 0 ? Math.min(100, Math.round((spent / b.amountMinor) * 100)) : 100,
      rollover: b.rollover,
    };
  });

  return { period: key, rows };
}

export async function monthlyBudgetWarnings(userId: string, tz: string, startDay: number) {
  const { rows } = await listBudgets(userId, tz, startDay);
  return rows.filter((r) => r.percentUsed >= 80 || r.overspentMinor > 0);
}