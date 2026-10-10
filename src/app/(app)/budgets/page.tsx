"use client";

import { useCallback, useEffect, useState } from "react";
import { api, formatMoney } from "@/lib/client-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label, FieldGroup } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { LoadingState } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

interface BudgetRow {
  id: string;
  categoryId: string | null;
  categoryName: string;
  categoryColor: string | null;
  amountMinor: number;
  spentMinor: number;
  remainingMinor: number;
  overspentMinor: number;
  percentUsed: number;
  rollover: boolean;
}

interface Category {
  id: string;
  name: string;
  kind: string;
  color: string;
}

export default function BudgetsPage() {
  const [period, setPeriod] = useState("");
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editState, setEditState] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ categoryId: "", amount: "" });

  const loadBudgets = useCallback(
    async (key: string) => {
      const data = await api<{ period: string; rows: BudgetRow[] }>(
        `/api/budgets?period=${key}`,
      );
      setRows(data.rows);
    },
    [],
  );

  useEffect(() => {
    const d = new Date();
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    setPeriod(key);
    (async () => {
      try {
        const [, catData] = await Promise.all([
          loadBudgets(key),
          api<{ rows: Category[] }>("/api/categories?kind=expense"),
        ]);
        setCategories(catData.rows);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load budgets");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadBudgets]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const amount = parseFloat(form.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount");
      await api("/api/budgets", {
        method: "POST",
        body: JSON.stringify({ categoryId: form.categoryId || undefined, amount, period }),
      });
      setForm({ categoryId: "", amount: "" });
      await loadBudgets(period);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save budget");
    } finally {
      setSaving(false);
    }
  }

  async function inlineSet(row: BudgetRow) {
    const value = editState[row.id];
    if (!value) return;
    const amount = parseFloat(value);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid amount");
      return;
    }
    try {
      await api("/api/budgets", {
        method: "POST",
        body: JSON.stringify({ categoryId: row.categoryId ?? undefined, amount, period }),
      });
      setEditState((s) => ({ ...s, [row.id]: "" }));
      await loadBudgets(period);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update budget");
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this budget?")) return;
    try {
      await api(`/api/budgets?id=${id}`, { method: "DELETE" });
      await loadBudgets(period);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Budgets" description={`Monthly spending limits for ${period || "this period"}.`} />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Set a budget</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <FieldGroup>
              <Label htmlFor="b-category">Category</Label>
              <Select
                id="b-category"
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              >
                <option value="">Overall (all categories)</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="b-amount">Amount</Label>
              <Input
                id="b-amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
              />
            </FieldGroup>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {loading ? (
        <LoadingState label="Loading budgets..." />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No budgets for this period"
          description="Create one above to start tracking your spending."
        />
      ) : (
        <div className="space-y-4">
          {rows.map((b) => {
            const tone =
              b.percentUsed >= 100 ? "danger" : b.percentUsed >= 80 ? "warning" : "success";
            return (
              <Card key={b.id}>
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex items-center gap-2 font-medium">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: b.categoryColor ?? "#64748b" }}
                      />
                      {b.categoryName}
                    </span>
                    {b.overspentMinor > 0 ? (
                      <span className="text-sm font-medium text-destructive">
                        {formatMoney(b.spentMinor)} spent ·{" "}
                        {formatMoney(b.overspentMinor)} over
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {formatMoney(b.spentMinor)} of {formatMoney(b.amountMinor)}
                        <span className="ml-2 font-semibold text-foreground">
                          {formatMoney(b.remainingMinor)} left
                        </span>
                      </span>
                    )}
                  </div>
                  <Progress value={b.percentUsed} tone={tone} />
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder={`New amount (${formatMoney(b.amountMinor)})`}
                      value={editState[b.id] ?? ""}
                      onChange={(e) =>
                        setEditState((s) => ({ ...s, [b.id]: e.target.value }))
                      }
                      className="h-8 w-44"
                    />
                    <Button size="sm" variant="subtle" onClick={() => inlineSet(b)}>
                      Update
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDelete(b.id)}>
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
