"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ListTodo,
  PiggyBank,
  Bell,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { api, formatMoney } from "@/lib/client-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { buttonVariants } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

interface Me {
  id: string;
  email: string;
  name?: string | null;
  currency: string;
  timezone: string;
  salaryDay?: number;
  savingsGoalMinor?: number;
}

interface Balance {
  accounts: { account: { id: string; name: string; type: string }; availableMinor: number }[];
  availableMinor: number;
  currency: string;
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt?: string | null;
}

interface NotificationRow {
  id: string;
  title: string;
  body?: string | null;
  readAt?: string | null;
  createdAt: string;
}

interface DashboardReport {
  monthKey: string;
  currency: string;
  balance: Balance;
  breakdown: { totalIncomeMinor: number; totalExpenseMinor: number };
}

interface BudgetWarning {
  id: string;
  categoryName: string;
  categoryColor: string | null;
  amountMinor: number;
  spentMinor: number;
  percentUsed: number;
  overspentMinor: number;
}

interface DashboardPayload {
  me: Me;
  report: DashboardReport;
  tasks: { rows: TaskRow[] };
  notifications: { rows: NotificationRow[] };
  budgets: { rows: BudgetWarning[] };
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [report, setReport] = useState<DashboardReport | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [budgets, setBudgets] = useState<BudgetWarning[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const payload = await api<DashboardPayload>("/api/dashboard");
        setMe(payload.me);
        setReport(payload.report);
        setTasks(payload.tasks.rows);
        setNotifications(payload.notifications.rows);
        setBudgets(
          payload.budgets.rows.filter((b) => b.percentUsed >= 80 || b.overspentMinor > 0),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <LoadingState label="Loading your dashboard..." />;
  }

  if (!me) {
    return (
      <EmptyState
        title="Please sign in"
        description={error || "Your session may have expired."}
        action={
          <a href="/login" className={buttonVariants()}>
            Go to login
          </a>
        }
      />
    );
  }

  const currency = report?.currency ?? me.currency;
  const income = report?.breakdown.totalIncomeMinor ?? 0;
  const expense = report?.breakdown.totalExpenseMinor ?? 0;
  const available = report?.balance.availableMinor ?? 0;
  const hasData = report && (income > 0 || expense > 0 || available > 0);
  const savingsGoal = me.savingsGoalMinor ?? 0;
  const netSavings = income - expense;
  const goalRemaining = Math.max(0, savingsGoal - available);
  const goalPercent =
    savingsGoal > 0 ? Math.min(100, Math.round((available / savingsGoal) * 100)) : 0;
  const monthsToGoal =
    netSavings > 0 && goalRemaining > 0 ? Math.ceil(goalRemaining / netSavings) : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description={`Welcome back, ${me.name || me.email}`}>
        <Link href="/assistant" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Sparkles className="h-4 w-4" />
          Ask AI
        </Link>
      </PageHeader>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!hasData ? (
        <Card>
          <CardHeader>
            <CardTitle>Get started</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>You have no transactions yet. Try one of these:</p>
            <ul className="space-y-1.5">
              <li>
                Add your salary:{" "}
                <Link href="/assistant" className="font-medium text-foreground underline">
                  &ldquo;Add income 150000 for Salary&rdquo;
                </Link>
              </li>
              <li>
                Log an expense:{" "}
                <Link href="/assistant" className="font-medium text-foreground underline">
                  &ldquo;Add expense 500 for lunch&rdquo;
                </Link>
              </li>
              <li>
                Or use the{" "}
                <Link href="/transactions" className="font-medium text-foreground underline">
                  transactions form
                </Link>
                .
              </li>
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Current balance"
          value={formatMoney(available, currency)}
          icon={Wallet}
          tone="bg-emerald-100 text-emerald-700"
        />
        <StatCard
          label={`Income (${report?.monthKey ?? "—"})`}
          value={formatMoney(income, currency)}
          icon={TrendingUp}
          tone="bg-blue-100 text-blue-700"
        />
        <StatCard
          label={`Expenses (${report?.monthKey ?? "—"})`}
          value={formatMoney(expense, currency)}
          icon={TrendingDown}
          tone="bg-rose-100 text-rose-700"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <PiggyBank className="h-4 w-4" /> Savings goal
            </CardTitle>
            <Link
              href="/settings"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Set goal <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {savingsGoal > 0 ? (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-semibold tabular-nums">
                    {formatMoney(available, currency)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    of {formatMoney(savingsGoal, currency)}
                  </span>
                </div>
                <Progress
                  value={goalPercent}
                  tone={goalPercent >= 100 ? "success" : "primary"}
                />
                <p className="text-sm text-muted-foreground">
                  {goalPercent}% saved
                  {goalRemaining > 0
                    ? netSavings > 0 && monthsToGoal
                      ? ` · ~${monthsToGoal} month${monthsToGoal > 1 ? "s" : ""} to go at ${formatMoney(netSavings, currency)}/mo`
                      : ` · ${formatMoney(goalRemaining, currency)} to go`
                    : " · Goal reached!"}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No savings goal set. Add one in Settings to track progress.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4" /> Budget alerts
            </CardTitle>
            <Link
              href="/budgets"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Budgets <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {budgets.length === 0 ? (
              <p className="text-sm text-muted-foreground">All budgets are on track.</p>
            ) : (
              <ul className="space-y-3">
                {budgets.map((b) => (
                  <li key={b.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: b.categoryColor ?? "#64748b" }}
                        />
                        {b.categoryName}
                      </span>
                      <span
                        className={
                          b.overspentMinor > 0
                            ? "font-medium text-destructive"
                            : "text-muted-foreground"
                        }
                      >
                        {b.overspentMinor > 0
                          ? `${formatMoney(b.overspentMinor, currency)} over`
                          : `${b.percentUsed}% used`}
                      </span>
                    </div>
                    <Progress
                      value={b.percentUsed}
                      tone={b.overspentMinor > 0 ? "danger" : "warning"}
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ListTodo className="h-4 w-4" /> Open tasks
            </CardTitle>
            <Link
              href="/tasks"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No tasks yet. Add one in Tasks or ask the AI Assistant.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                    <span
                      className={
                        t.status === "completed"
                          ? "text-sm text-muted-foreground line-through"
                          : "text-sm"
                      }
                    >
                      {t.title}
                    </span>
                    <div className="flex items-center gap-2">
                      {(t.priority === "high" || t.priority === "urgent") && (
                        <Badge tone="danger">{t.priority}</Badge>
                      )}
                      {t.dueAt ? (
                        <span className="text-xs text-muted-foreground">
                          {new Date(t.dueAt).toLocaleDateString()}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4" /> Recent notifications
            </CardTitle>
            <Link
              href="/notifications"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {notifications.length === 0 ? (
              <p className="text-sm text-muted-foreground">No notifications yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {notifications.map((n) => (
                  <li key={n.id} className="py-2">
                    <p className="text-sm">{n.title}</p>
                    {n.body ? (
                      <p className="text-xs text-muted-foreground">{n.body}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
