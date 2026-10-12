"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRightLeft, Wallet } from "lucide-react";
import { api, formatMoney } from "@/lib/client-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label, FieldGroup } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

interface AccountRow {
  id: string;
  name: string;
  type: string;
  currency: string;
  isDefault: boolean;
  openingBalanceMinor: number;
  availableMinor: number;
  incomeMinor: number;
  expenseMinor: number;
}

interface Me {
  currency: string;
}

const TYPE_LABEL: Record<string, string> = {
  cash: "Cash",
  bank: "Bank",
  wallet: "Wallet",
  credit: "Credit",
  other: "Other",
};

const ACCOUNT_TYPES = ["cash", "bank", "wallet", "credit", "other"] as const;

function todayLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function toMinorString(value: string): number | null {
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export default function AccountsPage() {
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    type: "cash",
    opening: "",
    isDefault: false,
  });
  const [form, setForm] = useState({
    name: "",
    type: "cash",
    currency: "PKR",
    opening: "",
    isDefault: false,
  });
  const [transfer, setTransfer] = useState({
    from: "",
    to: "",
    amount: "",
    date: todayLocal(),
    description: "",
  });

  const loadAccounts = useCallback(async () => {
    const data = await api<{ rows: AccountRow[] }>("/api/accounts");
    setRows(data.rows);
    return data.rows;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [, me] = await Promise.all([loadAccounts(), api<Me>("/api/me")]);
        setForm((f) => ({ ...f, currency: me.currency ?? "PKR" }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load accounts");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadAccounts]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const openingMinor = form.opening ? toMinorString(form.opening) : 0;
      if (openingMinor === null) throw new Error("Enter a valid opening balance");
      await api("/api/accounts", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          type: form.type,
          currency: form.currency,
          openingBalanceMinor: openingMinor,
          isDefault: form.isDefault,
        }),
      });
      setForm({ name: "", type: "cash", currency: form.currency, opening: "", isDefault: false });
      await loadAccounts();
      setMessage("Account added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row: AccountRow) {
    setEditId(row.id);
    setEditForm({
      name: row.name,
      type: row.type,
      opening: row.openingBalanceMinor ? String(row.openingBalanceMinor / 100) : "",
      isDefault: row.isDefault,
    });
  }

  async function handleEditSave(id: string) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const openingMinor = editForm.opening ? toMinorString(editForm.opening) : 0;
      if (openingMinor === null) throw new Error("Enter a valid opening balance");
      await api(`/api/accounts?id=${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editForm.name,
          type: editForm.type,
          openingBalanceMinor: openingMinor,
          isDefault: editForm.isDefault,
        }),
      });
      setEditId(null);
      await loadAccounts();
      setMessage("Account updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update account");
    } finally {
      setSaving(false);
    }
  }

  async function makeDefault(id: string) {
    setError("");
    setMessage("");
    try {
      await api(`/api/accounts?id=${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isDefault: true }),
      });
      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set default account");
    }
  }

  async function archive(id: string) {
    if (!window.confirm("Archive this account? Existing transactions are kept.")) return;
    setError("");
    setMessage("");
    try {
      await api(`/api/accounts?id=${id}`, { method: "DELETE" });
      await loadAccounts();
      setMessage("Account archived.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive account");
    }
  }

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (!transfer.from || !transfer.to) throw new Error("Choose both accounts");
      if (transfer.from === transfer.to) throw new Error("Choose two different accounts");
      const amount = parseFloat(transfer.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount");
      await api("/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          type: "transfer",
          amount,
          accountId: transfer.from,
          transferAccountId: transfer.to,
          date: transfer.date,
          description: transfer.description,
        }),
      });
      setTransfer({ ...transfer, amount: "", description: "" });
      await loadAccounts();
      setMessage("Transfer recorded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record transfer");
    } finally {
      setSaving(false);
    }
  }

  const totalMinor = rows.reduce((s, a) => s + a.availableMinor, 0);
  const currency = rows[0]?.currency ?? form.currency;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts"
        description="Track balances across cash, bank and wallet accounts."
      />

      {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Add account</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleCreate}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            <FieldGroup>
              <Label htmlFor="a-name">Name</Label>
              <Input
                id="a-name"
                type="text"
                placeholder="e.g. Meezan Bank"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="a-type">Type</Label>
              <Select
                id="a-type"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </Select>
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="a-currency">Currency</Label>
              <Select
                id="a-currency"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              >
                <option value="PKR">PKR</option>
                <option value="INR">INR</option>
                <option value="USD">USD</option>
                <option value="AED">AED</option>
                <option value="GBP">GBP</option>
              </Select>
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="a-opening">Opening balance</Label>
              <Input
                id="a-opening"
                type="number"
                step="0.01"
                placeholder="0"
                value={form.opening}
                onChange={(e) => setForm({ ...form, opening: e.target.value })}
              />
            </FieldGroup>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                className="h-4 w-4 accent-primary"
              />
              Make default
            </label>
            <div className="sm:col-span-2 lg:col-span-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Add account"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Your accounts</CardTitle>
          <span className="text-sm text-muted-foreground">
            Total: <span className="font-medium text-foreground">{formatMoney(totalMinor, currency)}</span>
          </span>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingState label="Loading accounts..." />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No accounts yet"
              description="Add your first account above to start tracking balances."
            />
          ) : (
            <div className="space-y-3">
              {rows.map((a) => (
                <div key={a.id} className="rounded-lg border border-border p-4">
                  {editId === a.id ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <FieldGroup>
                        <Label>Name</Label>
                        <Input
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        />
                      </FieldGroup>
                      <FieldGroup>
                        <Label>Type</Label>
                        <Select
                          value={editForm.type}
                          onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                        >
                          {ACCOUNT_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {TYPE_LABEL[t]}
                            </option>
                          ))}
                        </Select>
                      </FieldGroup>
                      <FieldGroup>
                        <Label>Opening balance</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={editForm.opening}
                          onChange={(e) => setEditForm({ ...editForm, opening: e.target.value })}
                        />
                      </FieldGroup>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={editForm.isDefault}
                          onChange={(e) =>
                            setEditForm({ ...editForm, isDefault: e.target.checked })
                          }
                          className="h-4 w-4 accent-primary"
                        />
                        Default account
                      </label>
                      <div className="flex gap-2 sm:col-span-2">
                        <Button size="sm" onClick={() => handleEditSave(a.id)} disabled={saving}>
                          Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{a.name}</span>
                          <Badge tone="muted">{TYPE_LABEL[a.type] ?? a.type}</Badge>
                          {a.isDefault ? <Badge tone="primary">Default</Badge> : null}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          <span className="font-semibold text-foreground">
                            {formatMoney(a.availableMinor, a.currency)}
                          </span>
                          <span className="ml-3 text-emerald-600">
                            +{formatMoney(a.incomeMinor, a.currency)}
                          </span>
                          <span className="ml-3 text-destructive">
                            −{formatMoney(a.expenseMinor, a.currency)}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {!a.isDefault ? (
                          <Button size="sm" variant="subtle" onClick={() => makeDefault(a.id)}>
                            Make default
                          </Button>
                        ) : null}
                        <Button size="sm" variant="outline" onClick={() => startEdit(a)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => archive(a.id)}>
                          Archive
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            Transfer between accounts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length < 2 ? (
            <p className="text-sm text-muted-foreground">
              Add at least two accounts to transfer between them.
            </p>
          ) : (
            <form
              onSubmit={handleTransfer}
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              <FieldGroup>
                <Label htmlFor="t-from">From</Label>
                <Select
                  id="t-from"
                  value={transfer.from}
                  onChange={(e) => setTransfer({ ...transfer, from: e.target.value })}
                >
                  <option value="">Select account</option>
                  {rows.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </FieldGroup>
              <FieldGroup>
                <Label htmlFor="t-to">To</Label>
                <Select
                  id="t-to"
                  value={transfer.to}
                  onChange={(e) => setTransfer({ ...transfer, to: e.target.value })}
                >
                  <option value="">Select account</option>
                  {rows.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </FieldGroup>
              <FieldGroup>
                <Label htmlFor="t-amount">Amount</Label>
                <Input
                  id="t-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0"
                  value={transfer.amount}
                  onChange={(e) => setTransfer({ ...transfer, amount: e.target.value })}
                  required
                />
              </FieldGroup>
              <FieldGroup>
                <Label htmlFor="t-date">Date</Label>
                <Input
                  id="t-date"
                  type="date"
                  value={transfer.date}
                  onChange={(e) => setTransfer({ ...transfer, date: e.target.value })}
                />
              </FieldGroup>
              <FieldGroup>
                <Label htmlFor="t-desc">Description</Label>
                <Input
                  id="t-desc"
                  type="text"
                  placeholder="e.g. ATM withdrawal"
                  value={transfer.description}
                  onChange={(e) => setTransfer({ ...transfer, description: e.target.value })}
                />
              </FieldGroup>
              <div className="flex items-end sm:col-span-2 lg:col-span-3">
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Transfer"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
