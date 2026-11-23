"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Wallet } from "lucide-react";
import { api, ClientError } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label, FieldGroup } from "@/components/ui/label";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token") ?? "");
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await api("/api/auth/reset/confirm", {
        method: "POST",
        body: JSON.stringify({ token, password }),
        skipAuthRedirect: true,
      });
      setMessage("Password updated. Redirecting to sign in...");
      setTimeout(() => router.push("/login"), 1200);
    } catch (err) {
      setError(
        err instanceof ClientError || err instanceof Error
          ? err.message
          : "Reset failed",
      );
    } finally {
      setLoading(false);
    }
  }

  const ready = password.length >= 8 && confirm.length >= 8 && token.length > 0;

  return (
    <div className="grid min-h-screen place-items-center bg-muted/30 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Wallet className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold">Choose a new password</h1>
        </div>

        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="grid gap-4">
              {!token ? (
                <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                  This link is missing its token. Request a new one from{" "}
                  <Link href="/forgot-password" className="font-medium text-primary hover:underline">
                    forgot password
                  </Link>
                  .
                </p>
              ) : null}
              <FieldGroup>
                <Label htmlFor="password">New password (min 8 chars)</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute inset-y-0 right-0 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? "Hide new password" : "Show new password"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </FieldGroup>
              <FieldGroup>
                <Label htmlFor="confirm">Confirm password</Label>
                <div className="relative">
                  <Input
                    id="confirm"
                    type={showPassword ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="pr-10"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute inset-y-0 right-0 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? "Hide confirm password" : "Show confirm password"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </FieldGroup>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
              <Button type="submit" disabled={loading || !ready}>
                {loading ? "Updating..." : "Update password"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
