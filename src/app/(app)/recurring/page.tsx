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

interface RecurringTemplate {
  type: string;
  amount?: number;
  description?: string;
  categoryId?: string;
  accountId?: string;
  transferAccountId?: string;
}

interface RecurringRule {
  id: string;
  frequency: string;
  interval: number;
  nextRunAt: string;
  active: boolean;
  template: RecurringTemplate;
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
};

const FREQUENCIES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

function todayLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function describeCadence(rule: RecurringRule): string {
  const every = rule.interval > 1 ? `Every ${rule.interval} ` : "";
  const unit =
    rule.frequency === "daily"
      ? "day"
      : rule.frequency === "weekly"
        ? "week"
        : rule.frequency === "yearly"
          ? "year"
          : "month";
  const plural = every || rule.interval > 1 ? "s" : "";
  return `${every}${unit}${plural}`.trim();
}

export default function RecurringPage() {
  const [rows, setRows] = useState<RecurringRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const emptyForm = {
    type: "expense",
    amount: "",
    categoryId: "",
    accountId: "",
    transferAccountId: "",
    description: "",
    frequency: "monthly",
    interval: 1,
    startDate: todayLocal(),
  };
  const [form, setForm] = useState(emptyForm);

  const loadRows = useCallback(async () => {
    const data = await api<{ rows: RecurringRule[] }>("/api/recurring");
    setRows(data.rows);
  }, []);

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
        setError(err instanceof Error ? err.message : "Failed to load recurring rules");
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
        frequency: form.frequency,
        interval: form.interval,
        startDate: form.startDate,
      };
      if (editingId) {
        await api("/api/recurring", {
          method: "PATCH",
          body: JSON.stringify({ id: editingId, ...payload }),
        });
        setEditingId(null);
      } else {
        await api("/api/recurring", { method: "POST", body: JSON.stringify(payload) });
      }
      setForm(emptyForm);
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save recurring rule");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(rule: RecurringRule) {
    setEditingId(rule.id);
    setForm({
      type: rule.template.type,
      amount: typeof rule.template.amount === "number" ? String(rule.template.amount) : "",
      categoryId: rule.template.categoryId ?? "",
      accountId: rule.template.accountId ?? "",
      transferAccountId: rule.template.transferAccountId ?? "",
      description: rule.template.description ?? "",
      frequency: rule.frequency,
      interval: rule.interval,
      startDate: rule.nextRunAt.slice(0, 10),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function toggleActive(rule: RecurringRule) {
    setError("");
    try {
      await api("/api/recurring", {
        method: "PATCH",
        body: JSON.stringify({ id: rule.id, active: !rule.active }),
      });
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update rule");
    }
  }

  async function removeRule(rule: RecurringRule) {
    if (!window.confirm("Delete this recurring rule?")) return;
    setError("");
    try {
      await api(`/api/recurring?id=${rule.id}`, { method: "DELETE" });
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete rule");
    }
  }

  const categoryName = (id?: string) =>
    categories.find((c) => c.id === id)?.name ?? undefined;
  const accountName = (id?: string) => accounts.find((a) => a.id === id)?.name ?? undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recurring"
        description="Automatically record transactions on a schedule."
      />

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Edit recurring transaction" : "New recurring transaction"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldGroup>
                <Label htmlFor="r-type">Type</Label>
                <Select
                  id="r-type"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                  <option value="transfer">Transfer</option>
                </Select>
              </FieldGroup>
              <FieldGroup>
                <Label htmlFor="r-amount">Amount</Label>
                <Input
                  id="r-amount"
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </FieldGroup>
              <FieldGroup>
                <Label htmlFor="r-category">Category</Label>
                <Select
                  id="r-category"
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                >
                  <option value="">None</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </FieldGroup>
              <FieldGroup>
                <Label htmlFor="r-account">Account</Label>
                <Select
                  id="r-account"
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
                  <Label htmlFor="r-transfer-account">To account</Label>
                  <Select
                    id="r-transfer-account"
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
                <Label htmlFor="r-frequency">Frequency</Label>
                <Select
                  id="r-frequency"
                  value={form.frequency}
                  onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                >
                  {FREQUENCIES.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </Select>
              </FieldGroup>
              <FieldGroup>
                <Label htmlFor="r-interval">Every N</Label>
                <Input
                  id="r-interval"
                  type="number"
                  min={1}
                  max={60}
                  value={form.interval}
                  onChange={(e) => setForm({ ...form, interval: Number(e.target.value) })}
                />
              </FieldGroup>
              <FieldGroup>
                <Label htmlFor="r-start">Start date</Label>
                <Input
                  id="r-start"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </FieldGroup>
              <FieldGroup>
                <Label htmlFor="r-description">Description</Label>
                <Input
                  id="r-description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </FieldGroup>
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : editingId ? "Save changes" : "Create rule"}
              </Button>
              {editingId ? (
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
          <CardTitle>Your rules</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingState label="Loading rules..." />
          ) : rows.length === 0 ? (
            <EmptyState title="No recurring rules" description="Create one above to automate entries." />
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((rule) => (
                <li key={rule.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge tone={rule.active ? "success" : "muted"}>
                        {rule.active ? "Active" : "Paused"}
                      </Badge>
                      <span className="font-medium">
                        {TYPE_LABEL[rule.template.type] ?? rule.template.type}
                      </span>
                      {typeof rule.template.amount === "number" ? (
                        <span className="text-sm text-muted-foreground">
                          {formatMoney(Math.round(rule.template.amount * 100))}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {describeCadence(rule)} · next{" "}
                      {new Date(rule.nextRunAt).toLocaleDateString()}
                      {rule.template.description ? ` · ${rule.template.description}` : ""}
                      {categoryName(rule.template.categoryId)
                        ? ` · ${categoryName(rule.template.categoryId)}`
                        : ""}
                      {accountName(rule.template.accountId)
                        ? ` · ${accountName(rule.template.accountId)}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => startEdit(rule)}>
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => toggleActive(rule)}>
                      {rule.active ? "Pause" : "Resume"}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => removeRule(rule)}>
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
