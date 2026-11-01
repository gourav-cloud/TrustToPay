import * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  neutral: "border-border bg-secondary/50 text-foreground",
  info: "border-blue-500/30 bg-blue-500/10 text-blue-200",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  danger: "border-red-500/30 bg-red-500/10 text-red-200",
  accent: "border-sky-500/30 bg-sky-500/10 text-sky-200",
} as const;

export function Alert({
  tone = "neutral",
  title,
  children,
  className,
  icon,
}: {
  tone?: keyof typeof tones;
  title?: string;
  children?: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div role="status" className={cn("flex gap-3 rounded-lg border p-3.5 text-sm", tones[tone], className)}>
      {icon ? <div className="mt-0.5 shrink-0">{icon}</div> : null}
      <div className="space-y-1">
        {title ? <p className="font-semibold leading-5 text-foreground">{title}</p> : null}
        {children ? <div className="text-[13px] leading-5 opacity-95">{children}</div> : null}
      </div>
    </div>
  );
}
