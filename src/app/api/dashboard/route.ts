import { unwrapAsync, requireApiUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { categoryBreakdown, monthlySeries, recentDailyExpense } from "@/lib/services/reports";
import { getCurrentBalance } from "@/lib/services/transactions";
import { listTasks } from "@/lib/services/tasks";
import { getInAppNotifications } from "@/lib/notifications";
import { listBudgets } from "@/lib/services/budgets";
import { taskQuerySchema } from "@/lib/validation";
import { currentMonthKey } from "@/lib/dates";

export async function GET() {
  return unwrapAsync(async () => {
    const user = await requireApiUser();
    const monthKey = currentMonthKey(user.timezone);
    const taskQuery = taskQuerySchema.parse({ status: "all", pageSize: 5 });

    const [me, balance, breakdown, series, dailyExpense, tasks, notifications, budgets] =
      await Promise.all([
        prisma.user.findUnique({
          where: { id: user.id },
          select: {
            id: true,
            email: true,
            name: true,
            currency: true,
            timezone: true,
            monthlySalaryMinor: true,
            salaryDay: true,
            openingBalanceMinor: true,
            savingsGoalMinor: true,
            financialMonthStartDay: true,
            notificationsEnabled: true,
            quietHoursStart: true,
            quietHoursEnd: true,
            theme: true,
            demoMode: true,
          },
        }),
        getCurrentBalance(user.id),
        categoryBreakdown(user.id, user.timezone, user.financialMonthStartDay, [monthKey]),
        monthlySeries(user.id, user.timezone, user.financialMonthStartDay, 6),
        recentDailyExpense(user.id, user.timezone, 7),
        listTasks(user.id, taskQuery),
        getInAppNotifications(user.id, { unreadOnly: false, limit: 5 }),
        listBudgets(user.id, user.timezone, user.financialMonthStartDay),
      ]);

    return {
      me,
      report: {
        monthKey,
        balance,
        breakdown,
        series,
        dailyExpense,
        currency: user.currency,
      },
      tasks,
      notifications,
      budgets,
    };
  });
}
