import { type NextRequest } from "next/server";
import { unwrapAsync, requireApiUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { env } from "@/lib/env";
import { categoryBreakdown, monthlySeries, dailyTrend, savingsOverTime, recurringExpenses, recentDailyExpense } from "@/lib/services/reports";
import { getCurrentBalance } from "@/lib/services/transactions";
import { currentMonthKey } from "@/lib/dates";
import { formatInTimeZone } from "date-fns-tz";

export async function GET(request: NextRequest) {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const { searchParams } = new URL(request.url);
    const kind = searchParams.get("kind") ?? "overview";
    const monthKey = searchParams.get("month") ?? currentMonthKey(user.timezone);

    if (kind === "category-breakdown") {
      const res = await categoryBreakdown(user.id, user.timezone, user.financialMonthStartDay, [monthKey]);
      return res;
    }
    if (kind === "monthly-series") {
      const count = Number(searchParams.get("count") ?? 6);
      return monthlySeries(user.id, user.timezone, user.financialMonthStartDay, count);
    }
    if (kind === "daily-trend") {
      return dailyTrend(user.id, user.timezone, user.financialMonthStartDay, monthKey);
    }
    if (kind === "savings") {
      const count = Number(searchParams.get("count") ?? 6);
      return savingsOverTime(user.id, user.timezone, user.financialMonthStartDay, count);
    }
    if (kind === "recurring") {
      const months = Number(searchParams.get("months") ?? 3);
      return recurringExpenses(user.id, months);
    }

    const [balance, breakdown, series, dailyExpense] = await Promise.all([
      getCurrentBalance(user.id),
      categoryBreakdown(user.id, user.timezone, user.financialMonthStartDay, [monthKey]),
      monthlySeries(user.id, user.timezone, user.financialMonthStartDay, 6),
      recentDailyExpense(user.id, user.timezone, 7),
    ]);

    return {
      monthKey,
      balance,
      breakdown,
      series,
      dailyExpense,
      currency: user.currency,
    };
  });
}