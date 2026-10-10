"use client";

import { useCallback, useEffect, useState } from "react";
import { api, formatMoney } from "@/lib/client-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label, FieldGroup } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

interface TxRow {
  id: string;
  type: string;
  amountMinor: number;
  currency: string;
  occurredAt: string;
  description?: string | null;
  category?: { id: string; name: string; color: string } | null;
  account?: { id: string; name: string } | null;
}

interface Category {
  id: string;
  name: string;
  kind: string;
  color: string;
}

interface Account {
  id: string;
  name: string;
  type: string;
}

const TYPE_LABEL: Record<string, string> = {
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
  refund: "Refund",
  adjustment: "Adjustment",
};

export default function TransactionsPage() {
  const [rows, setRows] = useState<TxRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({
    type: "expense",
    amount: "",
    categoryId: "",
    accountId: "",
    description: "",
    date: new Date().toISOString().slice(0, 10),
  });

  const loadRows = useCallback(async () => {
    const data = await api<{ rows: TxRow[] }>(
      `/api/transactions?pageSize=50&type=${filter}`,
    );
    setRows(data.rows);
  }, [filter]);

  useEffect(() => {
    (async () => {
      try {
        const [catData, accData] = await Promise.all([
          api<{ rows: Category[] }>("/api/categories"),
          api<{ rows: Account[] }>("/api/accounts"),
        ]);
        setCategories(catData.rows);
        setAccounts(accData.rows);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load form data");
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await loadRows();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load transactions");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadRows]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const amount = parseFloat(form.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount");
      await api("/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          type: form.type,
          amount,
          categoryId: form.categoryId || undefined,
          accountId: form.accountId || undefined,
          description: form.description,
          date: form.date,
        }),
      });
      setForm({ ...form, amount: "", description: "", categoryId: "" });
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create transaction");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this transaction?")) return;
    try {
      await api(`/api/transactions?id=${id}`, { method: "DELETE" });
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  const categoryKind = form.type === "income" ? "income" : "expense";

  return (
    <div className="space-y-6">
      <PageHeader title="Transactions" description="Record income, expenses and transfers." />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Add transaction</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            <FieldGroup>
              <Label htmlFor="tx-type">Type</Label>
              <Select
                id="tx-type"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value, categoryId: "" })}
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="transfer">Transfer</option>
              </Select>
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="tx-amount">Amount</Label>
              <Input
                id="tx-amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
              />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="tx-date">Date</Label>
              <Input
                id="tx-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="tx-category">Category</Label>
              <Select
                id="tx-category"
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                disabled={form.type === "transfer"}
              >
                <option value="">Auto / optional</option>
                {categories
                  .filter((c) => c.kind === categoryKind)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="tx-account">Account</Label>
              <Select
                id="tx-account"
                value={form.accountId}
                onChange={(e) => setForm({ ...form, accountId: e.target.value })}
              >
                <option value="">Default</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="tx-description">Description</Label>
              <Input
                id="tx-description"
                type="text"
                placeholder="e.g. lunch"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </FieldGroup>
            <div className="sm:col-span-2 lg:col-span-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Add transaction"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Recent transactions</CardTitle>
          <Select
            className="w-auto"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setLoading(true);
            }}
          >
            <option value="all">All types</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
            <option value="transfer">Transfer</option>
            <option value="refund">Refund</option>
          </Select>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingState label="Loading transactions..." />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No transactions yet"
              description="Add your first one above or try the AI Assistant."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 text-right font-medium">Amount</th>
                    <th className="py-2 pr-3 font-medium">Category</th>
                    <th className="py-2 pr-3 font-medium">Description</th>
                    <th className="py-2 pr-3 font-medium">Account</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id} className="border-b border-border/60 last:border-0">
                      <td className="whitespace-nowrap py-2 pr-3 text-muted-foreground">
                        {new Date(t.occurredAt).toLocaleDateString()}
                      </td>
                      <td className="py-2 pr-3">{TYPE_LABEL[t.type] ?? t.type}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">
                        <span
                          className={
                            t.type === "expense"
                              ? "text-destructive"
                              : t.type === "income" || t.type === "refund"
                                ? "text-emerald-600"
                                : "text-muted-foreground"
                          }
                        >
                          {t.type === "expense"
                            ? "−"
                            : t.type === "income" || t.type === "refund"
                              ? "+"
                              : ""}
                          {formatMoney(t.amountMinor, t.currency)}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        {t.category ? (
                          <span
                            className="inline-flex rounded-full px-2 py-0.5 text-xs"
                            style={{
                              backgroundColor: `${t.category.color}22`,
                              color: "#334155",
                            }}
                          >
                            {t.category.name}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">{t.description || "—"}</td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {t.account?.name ?? "—"}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => handleDelete(t.id)}
                          className="text-xs font-medium text-destructive hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
