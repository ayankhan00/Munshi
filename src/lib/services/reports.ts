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

// Distinct, vivid palette used to guarantee every category slice gets a
// different colour when the user's own category colours collide or are missing.
const FALLBACK_COLORS = [
  "#6366f1",
  "#f97316",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#0ea5e9",
  "#eab308",
  "#ec4899",
  "#14b8a6",
  "#f43f5e",
  "#84cc16",
  "#a855f7",
];

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function isHexColor(value: string | null | undefined): value is string {
  return !!value && /^#[0-9a-fA-F]{6}$/.test(value);
}

function weekStartKey(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Monday = 0
  const ws = new Date(Date.UTC(y, m - 1, d - dow));
  return `${ws.getUTCFullYear()}-${String(ws.getUTCMonth() + 1).padStart(2, "0")}-${String(
    ws.getUTCDate(),
  ).padStart(2, "0")}`;
}


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

  const expenseByCategory = new Map<
    string,
    { id: string | null; name: string; color: string; minor: number }
  >();
  let totalExpense = 0;
  let totalIncome = 0;

  for (const t of txns) {
    if (t.type === "income" || t.type === "refund") totalIncome += t.amountMinor;
    if (t.type === "expense") {
      totalExpense += t.amountMinor;
      const key = t.categoryId ?? "none";
      const prev = expenseByCategory.get(key) ?? {
        id: t.categoryId ?? null,
        name: t.category?.name ?? "Uncategorized",
        color: t.category?.color ?? "#64748b",
        minor: 0,
      };
      prev.minor += t.amountMinor;
      expenseByCategory.set(key, prev);
    }
  }

  const categories = [...expenseByCategory.values()]
    .map((v) => ({
      ...v,
      percent: totalExpense > 0 ? Math.round((v.minor / totalExpense) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.minor - a.minor);

  // Guarantee a unique colour per slice: keep the user's category colour when
  // possible, otherwise fall back to the next unused palette colour.
  const usedColors = new Set<string>();
  for (const slice of categories) {
    let color = isHexColor(slice.color) ? slice.color.toLowerCase() : "";
    if (!color || usedColors.has(color)) {
      color =
        FALLBACK_COLORS.find((c) => !usedColors.has(c)) ??
        FALLBACK_COLORS[usedColors.size % FALLBACK_COLORS.length];
    }
    usedColors.add(color);
    slice.color = color;
  }

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

export interface ExpenseTrendPoint {
  date: string;
  label: string;
  minor: number;
}

/**
 * Expense trend over the last `days` days. Short windows return a point per
 * day; longer windows (> 31 days) are grouped into weeks so the chart stays
 * readable.
 */
export async function expenseTrend(
  userId: string,
  tz: string,
  days: number,
): Promise<{ days: number; granularity: "day" | "week"; points: ExpenseTrendPoint[] }> {
  const span = Math.min(Math.max(Math.round(days) || 7, 1), 366);
  const todayStart = startOfDayZoned(new Date(), tz);
  const start = fnAddDays(todayStart, -(span - 1));
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

  if (span <= 31) {
    const points: ExpenseTrendPoint[] = [];
    for (let i = 0; i < span; i++) {
      const dayDate = fnAddDays(start, i);
      const key = dateKey(dayDate, tz);
      points.push({
        date: key,
        label: formatInTimeZone(dayDate, tz, "EEE d"),
        minor: totals.get(key) ?? 0,
      });
    }
    return { days: span, granularity: "day", points };
  }

  const buckets: ExpenseTrendPoint[] = [];
  const index = new Map<string, number>();
  for (let i = 0; i < span; i++) {
    const dayDate = fnAddDays(start, i);
    const dayK = dateKey(dayDate, tz);
    const wk = weekStartKey(dayK);
    let idx = index.get(wk);
    if (idx === undefined) {
      idx = buckets.length;
      index.set(wk, idx);
      const [, mm, dd] = wk.split("-").map(Number);
      buckets.push({ date: wk, label: `${dd} ${MONTH_ABBR[mm - 1]}`, minor: 0 });
    }
    buckets[idx].minor += totals.get(dayK) ?? 0;
  }
  return { days: span, granularity: "week", points: buckets };
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