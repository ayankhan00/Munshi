"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Repeat,
  PiggyBank,
  ListTodo,
  BellRing,
  BarChart3,
  Sparkles,
  Settings as SettingsIcon,
  LogOut,
  Menu,
  X,
  Wallet,
  Landmark,
  Tags,
} from "lucide-react";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  { href: "/assistant", label: "AI Assistant", icon: Sparkles },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/recurring", label: "Recurring", icon: Repeat },
  { href: "/budgets", label: "Budgets", icon: PiggyBank },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/calendar", label: "Reminders", icon: BellRing },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

interface Me {
  email: string;
  name?: string | null;
  theme?: string;
}

export default function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user?: Me | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(user ?? null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (user) return;
    api<Me>("/api/me")
      .then(setMe)
      .catch(() => undefined);
  }, [user]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
    }
  }

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="border-t border-border p-3">
      <div className="mb-3 flex items-center justify-between px-1">
        <span className="text-xs text-muted-foreground">Theme</span>
        <ThemeToggle initial={me?.theme} />
      </div>
      <div className="mb-2 truncate px-2 text-xs text-muted-foreground">
        {me?.name || me?.email || "…"}
      </div>
      <Button variant="outline" size="sm" className="w-full" onClick={logout}>
        <LogOut className="h-4 w-4" />
        Sign out
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-border px-5">
          <Wallet className="h-5 w-5" />
          <span className="font-semibold">Munshi</span>
        </div>
        <div className="py-4">{nav}</div>
        {footer}
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card px-4 md:hidden">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          <span className="font-semibold">Munshi</span>
        </div>
        <Button variant="ghost" size="icon" aria-label="Menu" onClick={() => setOpen((v) => !v)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </header>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-20 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-border bg-card pt-14">
            <div className="py-4">{nav}</div>
            {footer}
          </aside>
        </div>
      ) : null}

      <main className="md:pl-64">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
