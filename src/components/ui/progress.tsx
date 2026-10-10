import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "primary";

const TONES: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-amber-500",
  danger: "bg-destructive",
  primary: "bg-primary",
};

export function Progress({
  value,
  tone = "primary",
  className,
}: {
  value: number;
  tone?: Tone;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn("h-full rounded-full transition-all", TONES[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
