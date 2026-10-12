"use client";

import { useCallback, useEffect, useState } from "react";
import { Tags } from "lucide-react";
import { api } from "@/lib/client-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label, FieldGroup } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

interface CategoryRow {
  id: string;
  name: string;
  kind: string;
  color: string;
  icon?: string | null;
  isSystem: boolean;
  archived: boolean;
}

const DEFAULT_COLOR = "#64748b";

export default function CategoriesPage() {
  const [rows, setRows] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", color: DEFAULT_COLOR, icon: "" });
  const [form, setForm] = useState({
    name: "",
    kind: "expense",
    color: DEFAULT_COLOR,
    icon: "",
  });

  const loadCategories = useCallback(async () => {
    const data = await api<{ rows: CategoryRow[] }>("/api/categories");
    setRows(data.rows);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await loadCategories();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load categories");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadCategories]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api("/api/categories", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          kind: form.kind,
          color: form.color,
          icon: form.icon || undefined,
        }),
      });
      setForm({ ...form, name: "", icon: "" });
      await loadCategories();
      setMessage("Category saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save category");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row: CategoryRow) {
    setEditId(row.id);
    setEditForm({ name: row.name, color: row.color, icon: row.icon ?? "" });
  }

  async function handleEditSave(id: string) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api(`/api/categories?id=${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editForm.name,
          color: editForm.color,
          icon: editForm.icon || undefined,
        }),
      });
      setEditId(null);
      await loadCategories();
      setMessage("Category updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update category");
    } finally {
      setSaving(false);
    }
  }

  async function archive(id: string) {
    if (!window.confirm("Archive this category? Existing transactions keep their label.")) return;
    setError("");
    setMessage("");
    try {
      await api(`/api/categories?id=${id}`, { method: "DELETE" });
      await loadCategories();
      setMessage("Category archived.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive category");
    }
  }

  const expense = rows.filter((c) => c.kind === "expense");
  const income = rows.filter((c) => c.kind === "income");

  function renderList(list: CategoryRow[]) {
    return (
      <div className="space-y-2">
        {list.map((c) => (
          <div
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
          >
            {editId === c.id ? (
              <div className="flex w-full flex-wrap items-end gap-2">
                <FieldGroup className="flex-1">
                  <Label>Name</Label>
                  <Input
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                </FieldGroup>
                <FieldGroup>
                  <Label>Color</Label>
                  <Input
                    type="color"
                    className="h-9 w-16 p-1"
                    value={editForm.color}
                    onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                  />
                </FieldGroup>
                <FieldGroup>
                  <Label>Icon</Label>
                  <Input
                    placeholder="optional"
                    value={editForm.icon}
                    onChange={(e) => setEditForm({ ...editForm, icon: e.target.value })}
                  />
                </FieldGroup>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleEditSave(c.id)} disabled={saving}>
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditId(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                  <span className="font-medium">{c.name}</span>
                  {c.isSystem ? <Badge tone="muted">Built-in</Badge> : null}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => startEdit(c)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => archive(c.id)}>
                    Archive
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories"
        description="Organize income and expenses with custom categories and colors."
      />

      {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Add category</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleCreate}
            className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-end"
          >
            <FieldGroup>
              <Label htmlFor="c-name">Name</Label>
              <Input
                id="c-name"
                type="text"
                placeholder="e.g. Coffee"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="c-kind">Kind</Label>
              <Select
                id="c-kind"
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </Select>
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="c-color">Color</Label>
              <Input
                id="c-color"
                type="color"
                className="h-9 w-16 p-1"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="c-icon">Icon</Label>
              <Input
                id="c-icon"
                type="text"
                placeholder="optional"
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
              />
            </FieldGroup>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Add"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {loading ? (
        <LoadingState label="Loading categories..." />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="No categories yet"
          description="Add one above or record a transaction to auto-create categories."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Expense categories</CardTitle>
            </CardHeader>
            <CardContent>
              {expense.length === 0 ? (
                <p className="text-sm text-muted-foreground">No expense categories.</p>
              ) : (
                renderList(expense)
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Income categories</CardTitle>
            </CardHeader>
            <CardContent>
              {income.length === 0 ? (
                <p className="text-sm text-muted-foreground">No income categories.</p>
              ) : (
                renderList(income)
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
