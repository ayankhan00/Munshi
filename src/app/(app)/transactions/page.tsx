"use client";

import { useCallback, useEffect, useState } from "react";
import { api, formatMoney } from "@/lib/client-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  categoryId?: string | null;
  accountId?: string | null;
  transferAccountId?: string | null;
  category?: { id: string; name: string; color: string } | null;
  account?: { id: string; name: string } | null;
  transferAccount?: { id: string; name: string } | null;
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

function todayLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function TransactionsPage() {
  const [rows, setRows] = useState<TxRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const emptyForm = {
    type: "expense",
    amount: "",
    categoryId: "",
    accountId: "",
    transferAccountId: "",
    description: "",
    date: todayLocal(),
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const initCategory = sp.get("categoryId");
    const initType = sp.get("type");
    const initFrom = sp.get("from");
    const initTo = sp.get("to");
    const initQ = sp.get("q");
    if (initCategory) setCategoryId(initCategory);
    if (initType) setFilter(initType);
    if (initFrom) setFrom(initFrom);
    if (initTo) setTo(initTo);
    if (initQ) setQ(initQ);
  }, []);

  const loadRows = useCallback(async () => {
    const params = new URLSearchParams({ pageSize: "50" });
    if (filter !== "all") params.set("type", filter);
    if (debouncedQ) params.set("q", debouncedQ);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (categoryId) params.set("categoryId", categoryId);
    const data = await api<{ rows: TxRow[] }>(`/api/transactions?${params.toString()}`);
    setRows(data.rows);
  }, [filter, debouncedQ, from, to, categoryId]);

  function resetFilters() {
    setQ("");
    setDebouncedQ("");
    setFrom("");
    setTo("");
    setCategoryId("");
    setFilter("all");
    setLoading(true);
  }

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
      const payload = {
        type: form.type,
        amount,
        categoryId: form.categoryId || undefined,
        accountId: form.accountId || undefined,
        transferAccountId:
          form.type === "transfer" ? form.transferAccountId || undefined : undefined,
        description: form.description,
        date: form.date,
      };
      if (editId) {
        await api("/api/transactions", {
          method: "PUT",
          body: JSON.stringify({ id: editId, ...payload }),
        });
        setEditId(null);
      } else {
        await api("/api/transactions", { method: "POST", body: JSON.stringify(payload) });
      }
      setForm(emptyForm);
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save transaction");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(t: TxRow) {
    setEditId(t.id);
    setForm({
      type: t.type,
      amount: String(t.amountMinor / 100),
      categoryId: t.categoryId ?? "",
      accountId: t.accountId ?? "",
      transferAccountId: t.transferAccountId ?? "",
      description: t.description ?? "",
      date: t.occurredAt.slice(0, 10),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditId(null);
    setForm(emptyForm);
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
          <CardTitle>{editId ? "Edit transaction" : "Add transaction"}</CardTitle>
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
              {form.type === "transfer" ? (
                <FieldGroup>
                  <Label htmlFor="tx-transfer-account">To account</Label>
                  <Select
                    id="tx-transfer-account"
                    value={form.transferAccountId}
                    onChange={(e) =>
                      setForm({ ...form, transferAccountId: e.target.value })
                    }
                  >
                    <option value="">Select account</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                </FieldGroup>
              ) : null}
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
            <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : editId ? "Save changes" : "Add transaction"}
              </Button>
              {editId ? (
                <Button type="button" variant="outline" onClick={cancelEdit}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <FieldGroup>
              <Label htmlFor="f-q">Search</Label>
              <Input
                id="f-q"
                type="search"
                placeholder="Description or notes"
                value={q}
                onChange={(e) => {
                  setLoading(true);
                  setQ(e.target.value);
                }}
              />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="f-type">Type</Label>
              <Select
                id="f-type"
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
                <option value="adjustment">Adjustment</option>
              </Select>
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="f-category">Category</Label>
              <Select
                id="f-category"
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setLoading(true);
                }}
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="f-from">From</Label>
              <Input
                id="f-from"
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setLoading(true);
                }}
              />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="f-to">To</Label>
              <Input
                id="f-to"
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setLoading(true);
                }}
              />
            </FieldGroup>
            <div className="flex items-end">
              <Button variant="outline" onClick={resetFilters}>
                Reset filters
              </Button>
            </div>
          </div>
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
                        {t.type === "transfer" && t.transferAccount
                          ? ` → ${t.transferAccount.name}`
                          : ""}
                      </td>
                      <td className="whitespace-nowrap py-2 text-right">
                        <button
                          onClick={() => startEdit(t)}
                          className="text-xs font-medium text-foreground hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(t.id)}
                          className="ml-3 text-xs font-medium text-destructive hover:underline"
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
