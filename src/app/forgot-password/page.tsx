"use client";

import { useState } from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { api, ClientError } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label, FieldGroup } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [devToken, setDevToken] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    setDevToken("");
    try {
      const res = await api<{ message: string; devToken?: string }>("/api/auth/reset", {
        method: "POST",
        body: JSON.stringify({ email }),
        skipAuthRedirect: true,
      });
      setMessage(res.message);
      if (res.devToken) setDevToken(res.devToken);
    } catch (err) {
      setError(
        err instanceof ClientError || err instanceof Error
          ? err.message
          : "Request failed",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-muted/30 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Wallet className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold">Reset your password</h1>
          <p className="text-sm text-muted-foreground">
            Enter your email and we&#39;ll send you a reset link.
          </p>
        </div>

        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="grid gap-4">
              <FieldGroup>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </FieldGroup>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
              {devToken ? (
                <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                  Dev link:{" "}
                  <Link
                    href={`/reset-password?token=${devToken}`}
                    className="font-medium text-primary hover:underline"
                  >
                    /reset-password
                  </Link>
                </p>
              ) : null}
              <Button type="submit" disabled={loading || !email}>
                {loading ? "Sending..." : "Send reset link"}
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
