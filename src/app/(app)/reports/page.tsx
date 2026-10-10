"use client";

import { useCallback, useEffect, useState } from "react";
import {
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
import { api, formatMoney } from "@/lib/client-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

interface CategorySlice {
  name: string;
  color: string;
  minor: number;
  percent: number;
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

  const load = useCallback(async (key: string) => {
    const result = await api<ReportOverview>(`/api/reports?month=${key}`);
    setData(result);
  }, []);

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

  const income = data?.breakdown.totalIncomeMinor ?? 0;
  const expense = data?.breakdown.totalExpenseMinor ?? 0;
  const net = income - expense;
  const categories = data?.breakdown.categories ?? [];
  const series = (data?.series ?? []).map((s) => ({
    label: s.monthKey,
    incomeMinor: s.incomeMinor,
    expenseMinor: s.expenseMinor,
  }));
  const hasData = income > 0 || expense > 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Understand where your money goes.">
        <Select value={month} onChange={(e) => setMonth(e.target.value)} className="w-40">
          {monthOptions().map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
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
              <CardHeader>
                <CardTitle>Income vs expenses (6 months)</CardTitle>
              </CardHeader>
              <CardContent>
                {series.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Not enough data yet.
                  </p>
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={series}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" fontSize={11} />
                        <YAxis fontSize={11} tickFormatter={(v: number) => formatMoney(v)} />
                        <Tooltip formatter={(value: number) => formatMoney(value)} />
                        <Bar dataKey="incomeMinor" name="Income" fill="#10b981" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="expenseMinor" name="Expense" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Category breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {categories.length === 0 ? (
                <EmptyState title="No categories to show" />
              ) : (
                <ul className="divide-y divide-border">
                  {categories.map((c, i) => (
                    <li
                      key={c.name}
                      className="flex items-center justify-between py-2.5 text-sm"
                    >
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
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
