"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Repeat, Trash2 } from "lucide-react";
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

interface ReminderRow {
  id: string;
  title: string;
  body?: string | null;
  remindAt: string;
  status: string;
  type: string;
  recurrence?: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  bill: "Bill",
  task: "Task",
  salary: "Salary",
  budget: "Budget",
  custom: "Reminder",
};

export default function CalendarPage() {
  const [rows, setRows] = useState<ReminderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("upcoming");
  const [form, setForm] = useState({
    title: "",
    body: "",
    date: "",
    time: "09:00",
    type: "custom",
    recurrence: "none",
  });

  const loadRows = useCallback(async () => {
    const url =
      filter === "all"
        ? "/api/reminders"
        : filter === "upcoming"
          ? "/api/reminders?upcoming=1"
          : `/api/reminders?status=${filter}`;
    const data = await api<{ rows: ReminderRow[] }>(url);
    setRows(data.rows);
  }, [filter]);

  useEffect(() => {
    (async () => {
      try {
        await loadRows();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load reminders");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadRows]);

  function toInputDateTime(date: string, time: string): string | undefined {
    if (!date) return undefined;
    return new Date(`${date}T${time || "09:00"}`).toISOString();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/api/reminders", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          body: form.body,
          remindAt: toInputDateTime(form.date, form.time),
          type: form.type,
          recurrence: form.recurrence,
        }),
      });
      setForm({ ...form, title: "", body: "" });
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create reminder");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(r: ReminderRow, status: string) {
    try {
      await api("/api/reminders", {
        method: "PATCH",
        body: JSON.stringify({ id: r.id, status }),
      });
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update reminder");
    }
  }

  async function remove(r: ReminderRow) {
    if (!window.confirm("Delete this reminder?")) return;
    try {
      await api(`/api/reminders?id=${r.id}`, { method: "DELETE" });
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar & Reminders"
        description="Never miss a bill, task or event again."
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Add reminder</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FieldGroup className="sm:col-span-2 lg:col-span-4">
              <Label htmlFor="r-title">Title</Label>
              <Input
                id="r-title"
                type="text"
                placeholder="What should we remind you about?"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </FieldGroup>
            <FieldGroup className="sm:col-span-2 lg:col-span-4">
              <Label htmlFor="r-body">Details</Label>
              <Input
                id="r-body"
                type="text"
                placeholder="Optional details"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="r-date">Date</Label>
              <Input
                id="r-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="r-time">Time</Label>
              <Input
                id="r-time"
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
              />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="r-type">Type</Label>
              <Select
                id="r-type"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="custom">Reminder</option>
                <option value="bill">Bill</option>
                <option value="task">Task</option>
                <option value="salary">Salary</option>
              </Select>
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="r-recurrence">Repeat</Label>
              <Select
                id="r-recurrence"
                value={form.recurrence}
                onChange={(e) => setForm({ ...form, recurrence: e.target.value })}
              >
                <option value="none">Once</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </Select>
            </FieldGroup>
            <div className="sm:col-span-2 lg:col-span-4">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Add reminder"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>My reminders</CardTitle>
          <Select
            className="w-auto"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setLoading(true);
            }}
          >
            <option value="upcoming">Upcoming</option>
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="sent">Sent</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingState label="Loading reminders..." />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No reminders"
              description={`Add one above or ask the AI Assistant, e.g. "Remind me to pay the bill tomorrow at 6pm".`}
            />
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => {
                const isPast = new Date(r.remindAt) < new Date() && r.status === "pending";
                return (
                  <li key={r.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{r.title}</span>
                        <Badge tone="muted">{TYPE_LABEL[r.type] ?? r.type}</Badge>
                        {r.recurrence && r.recurrence !== "none" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Repeat className="h-3 w-3" />
                            {r.recurrence}
                          </span>
                        ) : null}
                      </div>
                      {r.body ? (
                        <p className="truncate text-xs text-muted-foreground">{r.body}</p>
                      ) : null}
                      <p
                        className={cn(
                          "text-xs",
                          isPast ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {new Date(r.remindAt).toLocaleString()}
                      </p>
                    </div>
                    {r.status === "pending" ? (
                      <Button size="sm" variant="subtle" onClick={() => setStatus(r, "done")}>
                        Mark done
                      </Button>
                    ) : (
                      <Badge tone="success">{r.status}</Badge>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Delete reminder"
                      onClick={() => remove(r)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
