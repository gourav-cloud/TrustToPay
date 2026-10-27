import * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  neutral: "border-border bg-muted/60 text-foreground",
  info: "border-blue-200 bg-blue-50/70 text-blue-900",
  success: "border-emerald-200 bg-emerald-50/70 text-emerald-900",
  warning: "border-amber-200 bg-amber-50/70 text-amber-900",
  danger: "border-red-200 bg-red-50/70 text-red-900",
  accent: "border-indigo-200 bg-indigo-50/70 text-indigo-900",
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
        {title ? <p className="font-medium leading-5">{title}</p> : null}
        {children ? <div className="text-[13px] leading-5 opacity-90">{children}</div> : null}
      </div>
    </div>
  );
}
