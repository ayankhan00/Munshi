import { type NextRequest } from "next/server";
import { fromZonedTime } from "date-fns-tz";
import { unwrapAsync, requireApiUser, ApiError } from "@/lib/api";
import { categoryBreakdown, monthlySeries, dailyTrend, savingsOverTime, recurringExpenses, recentDailyExpense, expenseTrend, rangeSummulative, topExpenses } from "@/lib/services/reports";
import { getCurrentBalance } from "@/lib/services/transactions";
import { currentMonthKey, fnAddDays } from "@/lib/dates";

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
    if (kind === "trend") {
      const days = Number(searchParams.get("days") ?? 7);
      return expenseTrend(user.id, user.timezone, Number.isFinite(days) ? days : 7);
    }
    if (kind === "range") {
      const from = searchParams.get("from");
      const to = searchParams.get("to");
      if (!from || !to) throw new ApiError(400, "from and to are required");
      const fromDate = fromZonedTime(`${from}T00:00:00`, user.timezone);
      const toExclusive = fnAddDays(fromZonedTime(`${to}T00:00:00`, user.timezone), 1);
      const [txns, top] = await Promise.all([
        rangeSummulative(user.id, { from: fromDate, toExclusive }),
        topExpenses(user.id, fromDate, toExclusive, 10),
      ]);
      let incomeMinor = 0;
      let expenseMinor = 0;
      for (const t of txns) {
        if (t.type === "income" || t.type === "refund") incomeMinor += t.amountMinor;
        else if (t.type === "expense") expenseMinor += t.amountMinor;
      }
      return {
        from,
        to,
        summary: { incomeMinor, expenseMinor, netMinor: incomeMinor - expenseMinor },
        topExpenses: top.map((t) => ({
          id: t.id,
          amountMinor: t.amountMinor,
          occurredAt: t.occurredAt,
          description: t.description,
          categoryId: t.categoryId,
          category: t.category ? { name: t.category.name, color: t.category.color } : null,
        })),
      };
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