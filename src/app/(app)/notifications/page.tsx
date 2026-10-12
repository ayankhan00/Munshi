"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { api } from "@/lib/client-api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

interface NotificationRow {
  id: string;
  title: string;
  body?: string | null;
  url?: string | null;
  type?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export default function NotificationsPage() {
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const data = await api<{ rows: NotificationRow[]; unread: number }>(
      "/api/notifications?limit=100",
    );
    setRows(data.rows);
    setUnread(data.unread);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load notifications");
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  async function markRead(id: string) {
    try {
      await api("/api/notifications", {
        method: "PATCH",
        body: JSON.stringify({ id }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    }
  }

  async function markAllRead() {
    setBusy(true);
    setError("");
    try {
      await api("/api/notifications", {
        method: "PATCH",
        body: JSON.stringify({ all: true }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    if (!window.confirm("Clear all notifications?")) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/notifications", { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description={unread > 0 ? `${unread} unread` : "You're all caught up."}
      >
        <Button variant="outline" size="sm" onClick={markAllRead} disabled={busy || unread === 0}>
          Mark all read
        </Button>
        <Button variant="outline" size="sm" onClick={clearAll} disabled={busy || rows.length === 0}>
          Clear all
        </Button>
      </PageHeader>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <LoadingState label="Loading notifications..." />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications"
          description="Reminders and alerts will appear here."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {rows.map((n) => {
                const content = (
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        n.readAt ? "bg-transparent" : "bg-primary",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={cn("text-sm", !n.readAt && "font-medium")}>{n.title}</p>
                        {n.type && n.type !== "info" ? (
                          <Badge tone="muted">{n.type}</Badge>
                        ) : null}
                      </div>
                      {n.body ? (
                        <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(n.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {!n.readAt ? (
                      <button
                        onClick={() => markRead(n.id)}
                        className="text-xs font-medium text-muted-foreground hover:text-foreground"
                      >
                        Mark read
                      </button>
                    ) : null}
                  </div>
                );
                return (
                  <li key={n.id} className="px-4 py-3">
                    {n.url ? (
                      <Link href={n.url} className="block">
                        {content}
                      </Link>
                    ) : (
                      content
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
