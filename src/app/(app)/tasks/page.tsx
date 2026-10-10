"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { api } from "@/lib/client-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label, FieldGroup } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

interface TaskRow {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  dueAt?: string | null;
  tags?: string | null;
}

const PRIORITY_TONE: Record<string, "success" | "warning" | "danger" | "default"> = {
  low: "success",
  medium: "warning",
  high: "danger",
  urgent: "danger",
};

export default function TasksPage() {
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({
    title: "",
    description: "",
    due: "",
    time: "",
    priority: "medium",
  });

  const loadRows = useCallback(async () => {
    const url =
      filter === "all"
        ? "/api/tasks?pageSize=50"
        : `/api/tasks?status=${filter}&pageSize=50`;
    const data = await api<{ rows: TaskRow[] }>(url);
    setRows(data.rows);
  }, [filter]);

  useEffect(() => {
    (async () => {
      try {
        await loadRows();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load tasks");
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
      const payload: Record<string, string> = {
        title: form.title,
        description: form.description,
        priority: form.priority,
      };
      if (form.due) {
        payload.dueAt = new Date(
          `${form.due}T${form.time || "09:00"}`,
        ).toISOString();
      }
      await api("/api/tasks", { method: "POST", body: JSON.stringify(payload) });
      setForm({ title: "", description: "", due: "", time: "", priority: "medium" });
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setSaving(false);
    }
  }

  async function toggleComplete(t: TaskRow) {
    await api("/api/tasks", {
      method: "PATCH",
      body: JSON.stringify({ id: t.id, completed: t.status !== "completed" }),
    });
    await loadRows();
  }

  async function removeTask(id: string) {
    if (!window.confirm("Delete this task?")) return;
    try {
      await api(`/api/tasks?id=${id}`, { method: "DELETE" });
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Tasks" description="Track everything you need to get done." />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Add task</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FieldGroup className="sm:col-span-2 lg:col-span-4">
              <Label htmlFor="t-title">Title</Label>
              <Input
                id="t-title"
                type="text"
                placeholder="e.g. Pay electricity bill"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </FieldGroup>
            <FieldGroup className="sm:col-span-2 lg:col-span-4">
              <Label htmlFor="t-description">Description</Label>
              <Input
                id="t-description"
                type="text"
                placeholder="Optional details"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="t-due">Due date</Label>
              <Input
                id="t-due"
                type="date"
                value={form.due}
                onChange={(e) => setForm({ ...form, due: e.target.value })}
              />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="t-time">Time</Label>
              <Input
                id="t-time"
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
              />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="t-priority">Priority</Label>
              <Select
                id="t-priority"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </Select>
            </FieldGroup>
            <div className="flex items-end">
              <Button type="submit" disabled={saving} className="w-full">
                {saving ? "Saving..." : "Add task"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>My tasks</CardTitle>
          <Select
            className="w-auto"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setLoading(true);
            }}
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingState label="Loading tasks..." />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No tasks yet"
              description="Add one above or ask the AI Assistant."
            />
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-3">
                  <input
                    type="checkbox"
                    checked={t.status === "completed"}
                    onChange={() => toggleComplete(t)}
                    className="h-4 w-4 accent-primary"
                    aria-label={`Mark ${t.title} complete`}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "truncate text-sm",
                        t.status === "completed" && "text-muted-foreground line-through",
                      )}
                    >
                      {t.title}
                    </p>
                    {t.description ? (
                      <p className="truncate text-xs text-muted-foreground">{t.description}</p>
                    ) : null}
                  </div>
                  {t.dueAt ? (
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {new Date(t.dueAt).toLocaleString()}
                    </span>
                  ) : null}
                  <Badge tone={PRIORITY_TONE[t.priority] ?? "default"}>{t.priority}</Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Delete task"
                    onClick={() => removeTask(t.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
