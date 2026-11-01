import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded border px-2 py-0.5 text-[11px] font-medium leading-4 tracking-wide",
  {
    variants: {
      tone: {
        neutral: "border-border bg-secondary/70 text-muted-foreground",
        info: "border-blue-500/30 bg-blue-500/12 text-blue-300",
        success: "border-emerald-500/30 bg-emerald-500/12 text-emerald-300",
        warning: "border-amber-500/30 bg-amber-500/12 text-amber-300",
        danger: "border-red-500/30 bg-red-500/12 text-red-300",
        accent: "border-sky-500/30 bg-sky-500/12 text-sky-300",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

const dotToneClasses: Record<NonNullable<VariantProps<typeof badgeVariants>["tone"]>, string> = {
  neutral: "bg-muted-foreground",
  info: "bg-blue-400",
  success: "bg-emerald-400",
  warning: "bg-amber-400",
  danger: "bg-red-400",
  accent: "bg-sky-400",
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export function Badge({ className, tone, dot = false, children, ...props }: BadgeProps) {
  const resolvedTone = tone ?? "neutral";
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot ? (
        <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", dotToneClasses[resolvedTone])} />
      ) : null}
      {children}
    </span>
  );
}
