import { prisma } from "@/lib/db";
import {
  monthRange,
  periodKey,
  currentMonthKey,
  fnAddMonths,
  startOfDayZoned,
  dateKey,
  fnAddDays,
} from "@/lib/dates";
import { formatInTimeZone } from "date-fns-tz";

export async function rangeSummulative(userId: string, opts: { from: Date; toExclusive: Date }) {
  const txns = await prisma.transaction.findMany({
    where: {
      userId,
      deletedAt: null,
      occurredAt: { gte: opts.from, lt: opts.toExclusive },
    },
    include: { category: true },
  });
  return txns;
}

export async function categoryBreakdown(
  userId: string,
  tz: string,
  startDay: number,
  monthKeys: string[],
) {
  const start = monthRange(monthKeys[0], tz, startDay).start;
  const end = monthRange(monthKeys[monthKeys.length - 1], tz, startDay).endExclusive;
  const txns = await rangeSummulative(userId, { from: start, toExclusive: end });

  const expenseByCategory = new Map<string, { name: string; color: string; minor: number }>();
  let totalExpense = 0;
  let totalIncome = 0;

  for (const t of txns) {
    if (t.type === "income" || t.type === "refund") totalIncome += t.amountMinor;
    if (t.type === "expense") {
      totalExpense += t.amountMinor;
      const key = t.categoryId ?? "none";
      const prev = expenseByCategory.get(key) ?? {
        name: t.category?.name ?? "Uncategorized",
        color: t.category?.color ?? "#64748b",
        minor: 0,
      };
      prev.minor += t.amountMinor;
      expenseByCategory.set(key, prev);
    }
  }

  const categories = [...expenseByCategory.entries()]
    .map(([, v]) => ({
      ...v,
      percent: totalExpense > 0 ? Math.round((v.minor / totalExpense) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.minor - a.minor);

  return { totalIncomeMinor: totalIncome, totalExpenseMinor: totalExpense, categories };
}

export async function monthlySeries(
  userId: string,
  tz: string,
  startDay: number,
  count = 6,
) {
  const curKey = currentMonthKey(tz);
  const [y, m] = curKey.split("-").map(Number);
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    keys.push(periodKey(d, "UTC"));
  }
  const ranges = keys.map((k) => monthRange(k, tz, startDay));
  const from = ranges[0].start;
  const to = ranges[ranges.length - 1].endExclusive;

  const txns = await prisma.transaction.findMany({
    where: { userId, deletedAt: null, occurredAt: { gte: from, lt: to } },
  });

  const series = keys.map((k, i) => {
    const r = ranges[i];
    let income = 0;
    let expense = 0;
    for (const t of txns) {
      if (t.occurredAt < r.start || t.occurredAt >= r.endExclusive) continue;
      if (t.type === "income" || t.type === "refund") income += t.amountMinor;
      if (t.type === "expense") expense += t.amountMinor;
    }
    return { monthKey: k, incomeMinor: income, expenseMinor: expense };
  });

  return series;
}

export async function dailyTrend(
  userId: string,
  tz: string,
  startDay: number,
  monthKey: string,
) {
  const r = monthRange(monthKey, tz, startDay);
  const txns = await prisma.transaction.findMany({
    where: { userId, deletedAt: null, type: "expense", occurredAt: { gte: r.start, lt: r.endExclusive } },
  });
  const byDay = new Map<string, number>();
  for (const t of txns) {
    const key = `${t.occurredAt.getUTCFullYear()}-${String(t.occurredAt.getUTCMonth() + 1).padStart(2, "0")}-${String(t.occurredAt.getUTCDate()).padStart(2, "0")}`;
    byDay.set(key, (byDay.get(key) ?? 0) + t.amountMinor);
  }
  return [...byDay.entries()]
    .map(([day, minor]) => ({ day, minor }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export async function recentDailyExpense(
  userId: string,
  tz: string,
  days = 7,
) {
  const todayStart = startOfDayZoned(new Date(), tz);
  const start = fnAddDays(todayStart, -(days - 1));
  const endExclusive = fnAddDays(todayStart, 1);

  const txns = await prisma.transaction.findMany({
    where: {
      userId,
      deletedAt: null,
      type: "expense",
      occurredAt: { gte: start, lt: endExclusive },
    },
  });

  const totals = new Map<string, number>();
  for (const t of txns) {
    const key = dateKey(t.occurredAt, tz);
    totals.set(key, (totals.get(key) ?? 0) + t.amountMinor);
  }

  const out: Array<{ date: string; label: string; minor: number }> = [];
  for (let i = 0; i < days; i++) {
    const dayDate = fnAddDays(start, i);
    const key = dateKey(dayDate, tz);
    out.push({
      date: key,
      label: formatInTimeZone(dayDate, tz, "EEE d"),
      minor: totals.get(key) ?? 0,
    });
  }
  return out;
}

export async function topExpenses(
  userId: string,
  from: Date,
  toExclusive: Date,
  limit = 5,
) {
  const txns = await prisma.transaction.findMany({
    where: { userId, deletedAt: null, type: "expense", occurredAt: { gte: from, lt: toExclusive } },
    include: { category: true },
    orderBy: { amountMinor: "desc" },
    take: limit,
  });
  return txns;
}

export async function recurringExpenses(
  userId: string,
  months = 3,
) {
  const curKey = currentMonthKey("UTC");
  const [y, m] = curKey.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1 - months, 1));
  const txns = await prisma.transaction.findMany({
    where: { userId, deletedAt: null, type: "expense", occurredAt: { gte: from } },
  });
  const groups = new Map<string, { count: number; total: number; last: Date }>();
  for (const t of txns) {
    const key = `${(t.description ?? "").toLowerCase()}|${t.amountMinor}`;
    const g = groups.get(key) ?? { count: 0, total: 0, last: t.occurredAt };
    g.count += 1;
    g.total += t.amountMinor;
    if (t.occurredAt > g.last) g.last = t.occurredAt;
    groups.set(key, g);
  }
  return [...groups.entries()]
    .filter(([, g]) => g.count >= 2)
    .map(([key, g]) => {
      const [desc, amount] = key.split("|");
      return { description: desc || "Unnamed", amountMinor: Number(amount), count: g.count };
    })
    .sort((a, b) => b.count - a.count);
}

export async function savingsOverTime(
  userId: string,
  tz: string,
  startDay: number,
  count = 6,
) {
  const series = await monthlySeries(userId, tz, startDay, count);
  let cumulative = 0;
  return series.map((s) => {
    cumulative += s.incomeMinor - s.expenseMinor;
    return { ...s, savingsMinor: cumulative };
  });
}

export { fnAddMonths };