"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { api } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Label, FieldGroup } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/spinner";
import { PageHeader } from "@/components/ui/page-header";
import {
  enablePush,
  disablePush,
  getPushStatus,
  type PushStatus,
} from "@/lib/push-client";

interface Me {
  id: string;
  email: string;
  name?: string | null;
  currency: string;
  timezone: string;
  monthlySalaryMinor: number;
  salaryDay: number;
  openingBalanceMinor: number;
  savingsGoalMinor: number;
  financialMonthStartDay: number;
  notificationsEnabled: boolean;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  theme: string;
}

const TIMEZONES = [
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dubai",
  "UTC",
  "Europe/London",
  "America/New_York",
];

export default function SettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    currency: "PKR",
    timezone: "Asia/Karachi",
    monthlySalaryMinor: "",
    salaryDay: 1,
    openingBalanceMinor: "",
    savingsGoalMinor: "",
    financialMonthStartDay: 1,
    notificationsEnabled: true,
    quietHoursStart: 22,
    quietHoursEnd: 7,
  });
  const [quietEnabled, setQuietEnabled] = useState(false);
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [pushStatus, setPushStatus] = useState<PushStatus | "loading">("loading");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await api<Me>("/api/me");
        setMe(data);
        setForm({
          name: data.name ?? "",
          currency: data.currency,
          timezone: data.timezone,
          monthlySalaryMinor: data.monthlySalaryMinor
            ? String(data.monthlySalaryMinor / 100)
            : "",
          salaryDay: data.salaryDay,
          openingBalanceMinor: data.openingBalanceMinor
            ? String(data.openingBalanceMinor / 100)
            : "",
          savingsGoalMinor: data.savingsGoalMinor ? String(data.savingsGoalMinor / 100) : "",
          financialMonthStartDay: data.financialMonthStartDay,
          notificationsEnabled: data.notificationsEnabled,
          quietHoursStart: data.quietHoursStart ?? 22,
          quietHoursEnd: data.quietHoursEnd ?? 7,
        });
        setQuietEnabled(data.quietHoursStart != null || data.quietHoursEnd != null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    let active = true;
    getPushStatus()
      .then((status) => {
        if (active) setPushStatus(status);
      })
      .catch(() => {
        if (active) setPushStatus("unsupported");
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleEnablePush() {
    setPushBusy(true);
    setPushMsg("");
    setError("");
    const result = await enablePush();
    setPushStatus(result.status);
    if (!result.ok) setError(result.error ?? "Failed to enable notifications.");
    else setPushMsg("Push notifications enabled on this device.");
    setPushBusy(false);
  }

  async function handleDisablePush() {
    setPushBusy(true);
    setPushMsg("");
    setError("");
    await disablePush();
    setPushStatus(await getPushStatus());
    setPushMsg("Push notifications disabled on this device.");
    setPushBusy(false);
  }

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await api("/api/me", {
        method: "PUT",
        body: JSON.stringify({
          name: form.name,
          currency: form.currency,
          timezone: form.timezone,
          monthlySalaryMinor: form.monthlySalaryMinor
            ? Math.round(parseFloat(form.monthlySalaryMinor) * 100)
            : 0,
          salaryDay: form.salaryDay,
          openingBalanceMinor: form.openingBalanceMinor
            ? Math.round(parseFloat(form.openingBalanceMinor) * 100)
            : 0,
          savingsGoalMinor: form.savingsGoalMinor
            ? Math.round(parseFloat(form.savingsGoalMinor) * 100)
            : 0,
          financialMonthStartDay: form.financialMonthStartDay,
          notificationsEnabled: form.notificationsEnabled,
          quietHoursStart: quietEnabled ? form.quietHoursStart : null,
          quietHoursEnd: quietEnabled ? form.quietHoursEnd : null,
        }),
      });
      setMessage("Profile saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await api("/api/me/password", { method: "POST", body: JSON.stringify(pw) });
      setMessage("Password changed.");
      setPw({ currentPassword: "", newPassword: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
    }
  }

  async function handleDeleteAccount() {
    if (!window.confirm("Delete your account and all data? This cannot be undone.")) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api("/api/me", { method: "DELETE" });
      router.push("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Loading settings..." />;
  if (!me) return null;

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Settings" description="Manage your profile and preferences." />

      {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleProfileSubmit} className="grid gap-3 sm:grid-cols-2">
            <FieldGroup>
              <Label htmlFor="s-name">Name</Label>
              <Input
                id="s-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="s-email">Email</Label>
              <Input id="s-email" type="email" value={me.email} disabled />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="s-currency">Currency</Label>
              <Select
                id="s-currency"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              >
                <option value="PKR">PKR (Rs.)</option>
                <option value="INR">INR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="AED">AED</option>
                <option value="GBP">GBP</option>
              </Select>
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="s-timezone">Timezone</Label>
              <Select
                id="s-timezone"
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </Select>
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="s-salary">Monthly salary</Label>
              <Input
                id="s-salary"
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 150000"
                value={form.monthlySalaryMinor}
                onChange={(e) => setForm({ ...form, monthlySalaryMinor: e.target.value })}
              />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="s-salaryday">Salary day</Label>
              <Input
                id="s-salaryday"
                type="number"
                min={1}
                max={28}
                value={form.salaryDay}
                onChange={(e) => setForm({ ...form, salaryDay: Number(e.target.value) })}
              />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="s-monthstart">Month starts on</Label>
              <Input
                id="s-monthstart"
                type="number"
                min={1}
                max={28}
                value={form.financialMonthStartDay}
                onChange={(e) =>
                  setForm({ ...form, financialMonthStartDay: Number(e.target.value) })
                }
              />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="s-opening">Opening balance</Label>
              <Input
                id="s-opening"
                type="number"
                step="0.01"
                placeholder="e.g. 10000"
                value={form.openingBalanceMinor}
                onChange={(e) => setForm({ ...form, openingBalanceMinor: e.target.value })}
              />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="s-goal">Savings goal</Label>
              <Input
                id="s-goal"
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 50000"
                value={form.savingsGoalMinor}
                onChange={(e) => setForm({ ...form, savingsGoalMinor: e.target.value })}
              />
            </FieldGroup>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={form.notificationsEnabled}
                onChange={(e) =>
                  setForm({ ...form, notificationsEnabled: e.target.checked })
                }
                className="h-4 w-4 accent-primary"
              />
              Enable notifications
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={quietEnabled}
                onChange={(e) => setQuietEnabled(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Quiet hours (pause notifications overnight)
            </label>
            {quietEnabled ? (
              <>
                <FieldGroup>
                  <Label htmlFor="s-quiet-start">Quiet from (hour)</Label>
                  <Input
                    id="s-quiet-start"
                    type="number"
                    min={0}
                    max={23}
                    value={form.quietHoursStart}
                    onChange={(e) =>
                      setForm({ ...form, quietHoursStart: Number(e.target.value) })
                    }
                  />
                </FieldGroup>
                <FieldGroup>
                  <Label htmlFor="s-quiet-end">Quiet until (hour)</Label>
                  <Input
                    id="s-quiet-end"
                    type="number"
                    min={0}
                    max={23}
                    value={form.quietHoursEnd}
                    onChange={(e) =>
                      setForm({ ...form, quietHoursEnd: Number(e.target.value) })
                    }
                  />
                </FieldGroup>
              </>
            ) : null}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save profile"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Push notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Get reminders on this device even when Munshi isn&#39;t open.
          </p>
          {pushStatus === "loading" ? (
            <p className="text-sm text-muted-foreground">Checking status...</p>
          ) : pushStatus === "unsupported" ? (
            <p className="text-sm text-muted-foreground">
              Push notifications aren&#39;t supported in this browser.
            </p>
          ) : pushStatus === "unconfigured" ? (
            <p className="text-sm text-muted-foreground">
              Push isn&#39;t configured on the server.
            </p>
          ) : pushStatus === "subscribed" ? (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-emerald-600">
                Enabled on this device
              </span>
              <Button variant="outline" onClick={handleDisablePush} disabled={pushBusy}>
                {pushBusy ? "Disabling..." : "Disable"}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={handleEnablePush} disabled={pushBusy}>
                {pushBusy ? "Enabling..." : "Enable notifications"}
              </Button>
              {pushStatus === "denied" ? (
                <span className="text-sm text-muted-foreground">
                  Blocked — allow notifications in your browser settings.
                </span>
              ) : null}
            </div>
          )}
          {pushMsg ? <p className="text-sm text-emerald-600">{pushMsg}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordSubmit} className="grid gap-3">
            <FieldGroup>
              <Label htmlFor="s-current">Current password</Label>
              <Input
                id="s-current"
                type="password"
                value={pw.currentPassword}
                onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })}
                required
              />
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="s-new">New password (min 8 chars)</Label>
              <Input
                id="s-new"
                type="password"
                value={pw.newPassword}
                onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
                required
                minLength={8}
              />
            </FieldGroup>
            <div>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Change password"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Deleting your account permanently removes all transactions, tasks, reminders
            and settings. This cannot be undone.
          </p>
          <Button variant="danger" onClick={handleDeleteAccount} disabled={saving}>
            Delete account
          </Button>
        </CardContent>
      </Card>

      <div>
        <Button variant="outline" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
          Log out
        </Button>
      </div>
    </div>
  );
}
