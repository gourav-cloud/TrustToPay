import type { TaskEvent } from "@/lib/types";
import { formatDate, humanize } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  BadgeCheck,
  Ban,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  Gavel,
  MessageSquarePlus,
  PlayCircle,
  Send,
  Sparkles,
  UserCheck,
  Wallet,
} from "lucide-react";

function iconFor(type: string) {
  if (type.includes("FUND")) return CreditCard;
  if (type.includes("ACCEPT") || type.includes("ASSIGN")) return UserCheck;
  if (type.includes("VERIF")) return FileCheck2;
  if (type.includes("PAYOUT") || type.includes("PAYMENT")) return Wallet;
  if (type.includes("SUBMIT")) return Send;
  if (type.includes("COMPLET") || type.includes("PAID") || type.includes("RESOLV")) return CheckCircle2;
  if (type.includes("DISPUT")) return Gavel;
  if (type.includes("RESUME")) return PlayCircle;
  if (type.includes("CANCEL") || type.includes("REJECT") || type.includes("FAIL")) return Ban;
  if (type.includes("CREATED") || type.includes("ANALYSIS")) return Sparkles;
  if (type.includes("ANSWER") || type.includes("REOPEN")) return MessageSquarePlus;
  return BadgeCheck;
}

export function TaskTimeline({ events, dense = false }: { events: TaskEvent[]; dense?: boolean }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No timeline events recorded yet.</p>;
  }

  return (
    <ol className={cn("relative space-y-0", dense ? "pl-0" : "pl-1")}>
      {events.map((event, index) => {
        const Icon = iconFor(event.type);
        const isLast = index === events.length - 1;
        return (
          <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
            {!isLast ? (
              <span
                aria-hidden
                className="absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px bg-border"
              />
            ) : null}
            <span className="relative z-10 mt-0.5 flex size-[27px] shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
              <Icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {humanize(event.type)}
                </p>
                <time className="text-[11px] tabular-nums text-muted-foreground" dateTime={event.createdAt}>
                  {formatDate(event.createdAt)}
                </time>
              </div>
              <p className="mt-0.5 text-sm leading-6">{event.message}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
