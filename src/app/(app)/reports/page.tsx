"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, Printer } from "lucide-react";
import { api, formatMoney } from "@/lib/client-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

interface CategorySlice {
  id: string | null;
  name: string;
  color: string;
  minor: number;
  percent: number;
}

interface SavingsPoint {
  monthKey: string;
  incomeMinor: number;
  expenseMinor: number;
  savingsMinor: number;
}

interface RangeReport {
  from: string;
  to: string;
  summary: { incomeMinor: number; expenseMinor: number; netMinor: number };
  topExpenses: Array<{
    id: string;
    amountMinor: number;
    occurredAt: string;
    description: string | null;
    categoryId: string | null;
    category: { name: string; color: string } | null;
  }>;
}

interface TrendPoint {
  date: string;
  label: string;
  minor: number;
}

interface Trend {
  days: number;
  granularity: "day" | "week";
  points: TrendPoint[];
}

interface ReportOverview {
  monthKey: string;
  balance: {
    accounts: Array<{ account: { id: string; name: string }; availableMinor: number }>;
    availableMinor: number;
    currency: string;
  };
  breakdown: {
    totalIncomeMinor: number;
    totalExpenseMinor: number;
    categories: CategorySlice[];
  };
  series: Array<{ monthKey: string; incomeMinor: number; expenseMinor: number }>;
  dailyExpense: Array<{ date: string; label: string; minor: number }>;
  currency: string;
}

const PIE_COLORS = [
  "#6366f1",
  "#f97316",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#0ea5e9",
  "#eab308",
  "#ec4899",
];

const RANGES = [
  { value: "7", label: "7D", days: 7, title: "last 7 days" },
  { value: "14", label: "2W", days: 14, title: "last 2 weeks" },
  { value: "30", label: "1M", days: 30, title: "last 30 days" },
  { value: "60", label: "2M", days: 60, title: "last 2 months" },
  { value: "90", label: "3M", days: 90, title: "last 3 months" },
];

function monthOptions(): string[] {
  const base = new Date();
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export default function ReportsPage() {
  const [month, setMonth] = useState(monthOptions()[0]);
  const [data, setData] = useState<ReportOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [range, setRange] = useState("7");
  const [trend, setTrend] = useState<Trend | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);

  const [savings, setSavings] = useState<SavingsPoint[]>([]);
  const [rangeFrom, setRangeFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [rangeTo, setRangeTo] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  });
  const [rangeReport, setRangeReport] = useState<RangeReport | null>(null);
  const [rangeLoading, setRangeLoading] = useState(false);

  const load = useCallback(async (key: string) => {
    const result = await api<ReportOverview>(`/api/reports?month=${key}`);
    setData(result);
  }, []);

  const loadTrend = useCallback(async (days: number) => {
    setTrendLoading(true);
    try {
      const result = await api<Trend>(`/api/reports?kind=trend&days=${days}`);
      setTrend(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trend");
    } finally {
      setTrendLoading(false);
    }
  }, []);

  const loadSavings = useCallback(async () => {
    try {
      const result = await api<SavingsPoint[]>(`/api/reports?kind=savings&count=6`);
      setSavings(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load savings");
    }
  }, []);

  const loadRange = useCallback(async () => {
    if (!rangeFrom || !rangeTo) return;
    setRangeLoading(true);
    setError("");
    try {
      const result = await api<RangeReport>(
        `/api/reports?kind=range&from=${rangeFrom}&to=${rangeTo}`,
      );
      setRangeReport(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load range report");
    } finally {
      setRangeLoading(false);
    }
  }, [rangeFrom, rangeTo]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await load(month);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load report");
      } finally {
        setLoading(false);
      }
    })();
  }, [load, month]);

  useEffect(() => {
    void loadTrend(7);
  }, [loadTrend]);

  useEffect(() => {
    void loadSavings();
  }, [loadSavings]);

  const income = data?.breakdown.totalIncomeMinor ?? 0;
  const expense = data?.breakdown.totalExpenseMinor ?? 0;
  const net = income - expense;
  const categories = data?.breakdown.categories ?? [];
  const hasData = income > 0 || expense > 0;

  const activeRange = RANGES.find((r) => r.value === range) ?? RANGES[0];
  const points = trend?.points ?? [];
  const trendTotal = points.reduce((sum, p) => sum + p.minor, 0);
  const trendAvg = points.length > 0 ? Math.round(trendTotal / points.length) : 0;
  const trendEmpty = points.length > 0 && points.every((p) => p.minor === 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Understand where your money goes.">
        <Select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="w-40 print:hidden"
        >
          {monthOptions().map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
        <a
          href={`/api/export/transactions?month=${month}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Download className="h-4 w-4" />
          Export CSV
        </a>
        <button
          type="button"
          onClick={() => window.print()}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Printer className="h-4 w-4" />
          Print
        </button>
      </PageHeader>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <LoadingState label="Loading report..." />
      ) : !hasData ? (
        <EmptyState
          title="No activity this period"
          description="Add some transactions and check back."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Income</p>
                <p className="mt-1 text-2xl font-semibold text-emerald-600">
                  {formatMoney(income)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Expenses</p>
                <p className="mt-1 text-2xl font-semibold text-destructive">
                  {formatMoney(expense)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Net</p>
                <p
                  className={
                    net >= 0
                      ? "mt-1 text-2xl font-semibold text-emerald-600"
                      : "mt-1 text-2xl font-semibold text-destructive"
                  }
                >
                  {formatMoney(net)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Balance</p>
                <p className="mt-1 text-2xl font-semibold">
                  {formatMoney(data!.balance.availableMinor, data!.currency)}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Spending by category</CardTitle>
              </CardHeader>
              <CardContent>
                {categories.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No expenses this period.
                  </p>
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categories}
                          dataKey="minor"
                          nameKey="name"
                          innerRadius={55}
                          outerRadius={100}
                          paddingAngle={2}
                        >
                          {categories.map((entry, index) => (
                            <Cell
                              key={entry.name}
                              fill={entry.color || PIE_COLORS[index % PIE_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatMoney(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
                <CardTitle>Expenses &middot; {activeRange.title}</CardTitle>
                <div className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5">
                  {RANGES.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => {
                        setRange(r.value);
                        void loadTrend(r.days);
                      }}
                      className={cn(
                        "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                        range === r.value
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4 grid grid-cols-2 gap-4">
                  <div className="rounded-lg bg-muted/40 px-4 py-3">
                    <p className="text-xs text-muted-foreground">Total spent</p>
                    <p className="mt-0.5 text-xl font-semibold text-destructive">
                      {formatMoney(trendTotal)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/40 px-4 py-3">
                    <p className="text-xs text-muted-foreground">
                      {trend?.granularity === "week" ? "Weekly average" : "Daily average"}
                    </p>
                    <p className="mt-0.5 text-xl font-semibold">{formatMoney(trendAvg)}</p>
                  </div>
                </div>

                {trendLoading && !trend ? (
                  <LoadingState label="Loading trend..." />
                ) : trendEmpty ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No expenses in the {activeRange.title}.
                  </p>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={points}
                        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="expenseBar" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="#fb7185" stopOpacity={0.3} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="label"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          interval="preserveStartEnd"
                          minTickGap={16}
                        />
                        <YAxis
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          width={58}
                          tickFormatter={(v: number) => formatMoney(v)}
                        />
                        <Tooltip
                          cursor={{ fill: "rgba(148, 163, 184, 0.15)" }}
                          formatter={(value: number) => [formatMoney(value), "Expenses"]}
                          contentStyle={{ borderRadius: 8, fontSize: 12 }}
                        />
                        <Bar
                          dataKey="minor"
                          name="Expenses"
                          fill="url(#expenseBar)"
                          radius={[6, 6, 0, 0]}
                          maxBarSize={44}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Net worth &middot; savings over time</CardTitle>
            </CardHeader>
            <CardContent>
              {savings.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No savings history yet.
                </p>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={savings.map((s) => ({
                        label: s.monthKey,
                        savingsMinor: s.savingsMinor,
                      }))}
                      margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="savingsArea" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="label"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        width={58}
                        tickFormatter={(v: number) => formatMoney(v)}
                      />
                      <Tooltip
                        formatter={(value: number) => [formatMoney(value), "Cumulative savings"]}
                        contentStyle={{ borderRadius: 8, fontSize: 12 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="savingsMinor"
                        name="Cumulative savings"
                        stroke="#059669"
                        strokeWidth={2}
                        fill="url(#savingsArea)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Category breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {categories.length === 0 ? (
                <EmptyState title="No categories to show" />
              ) : (
                <ul className="divide-y divide-border">
                  {categories.map((c, i) => {
                    const inner = (
                      <>
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{
                              backgroundColor: c.color || PIE_COLORS[i % PIE_COLORS.length],
                            }}
                          />
                          {c.name}
                          <span className="text-xs text-muted-foreground">{c.percent}%</span>
                        </span>
                        <span className="font-medium tabular-nums">{formatMoney(c.minor)}</span>
                      </>
                    );
                    return (
                      <li key={c.name} className="text-sm">
                        {c.id ? (
                          <Link
                            href={`/transactions?categoryId=${c.id}`}
                            className="flex items-center justify-between py-2.5 transition-colors hover:text-foreground"
                          >
                            {inner}
                          </Link>
                        ) : (
                          <div className="flex items-center justify-between py-2.5">{inner}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
              <CardTitle>Custom range</CardTitle>
              <div className="flex flex-wrap items-end gap-2 print:hidden">
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">From</label>
                  <Input
                    type="date"
                    value={rangeFrom}
                    onChange={(e) => setRangeFrom(e.target.value)}
                    className="w-40"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">To</label>
                  <Input
                    type="date"
                    value={rangeTo}
                    onChange={(e) => setRangeTo(e.target.value)}
                    className="w-40"
                  />
                </div>
                <Button size="sm" onClick={loadRange} disabled={rangeLoading}>
                  {rangeLoading ? "Loading..." : "Apply"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!rangeReport ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Pick a date range and click Apply.
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-lg bg-muted/40 px-4 py-3">
                      <p className="text-xs text-muted-foreground">Income</p>
                      <p className="mt-0.5 text-xl font-semibold text-emerald-600">
                        {formatMoney(rangeReport.summary.incomeMinor)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 px-4 py-3">
                      <p className="text-xs text-muted-foreground">Expenses</p>
                      <p className="mt-0.5 text-xl font-semibold text-destructive">
                        {formatMoney(rangeReport.summary.expenseMinor)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 px-4 py-3">
                      <p className="text-xs text-muted-foreground">Net</p>
                      <p
                        className={
                          rangeReport.summary.netMinor >= 0
                            ? "mt-0.5 text-xl font-semibold text-emerald-600"
                            : "mt-0.5 text-xl font-semibold text-destructive"
                        }
                      >
                        {formatMoney(rangeReport.summary.netMinor)}
                      </p>
                    </div>
                  </div>
                  {rangeReport.topExpenses.length > 0 ? (
                    <div>
                      <p className="mb-2 text-sm font-medium">Top expenses</p>
                      <ul className="divide-y divide-border">
                        {rangeReport.topExpenses.map((t) => (
                          <li
                            key={t.id}
                            className="flex items-center justify-between py-2 text-sm"
                          >
                            <span className="flex items-center gap-2">
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: t.category?.color ?? "#64748b" }}
                              />
                              {t.description || t.category?.name || "Expense"}
                              <span className="text-xs text-muted-foreground">
                                {new Date(t.occurredAt).toLocaleDateString()}
                              </span>
                            </span>
                            <span className="font-medium tabular-nums">
                              {formatMoney(t.amountMinor)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
