"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import {
  applyTheme,
  getStoredTheme,
  isTheme,
  setStoredTheme,
  type Theme,
} from "@/lib/theme";

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

export function ThemeToggle({ initial }: { initial?: string }) {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = window.localStorage.getItem("munshi:theme");
    const resolved = isTheme(stored)
      ? stored
      : isTheme(initial)
        ? initial
        : "system";
    setTheme(resolved);
    if (!isTheme(stored)) {
      setStoredTheme(resolved);
      applyTheme(resolved);
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (getStoredTheme() === "system") applyTheme("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [initial]);

  async function choose(next: Theme) {
    setTheme(next);
    setStoredTheme(next);
    applyTheme(next);
    try {
      await api("/api/me", { method: "PUT", body: JSON.stringify({ theme: next }) });
    } catch {
      // preference still applies locally
    }
  }

  return (
    <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          aria-pressed={theme === value}
          title={label}
          onClick={() => choose(value)}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded",
            theme === value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
