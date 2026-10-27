import { Link } from "react-router-dom";
import { ArrowUpRight, CalendarClock, UserRound } from "lucide-react";
import type { TaskSummary } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badges";
import { formatDate, formatMoney, truncate } from "@/lib/format";
import { categoryLabel } from "@/lib/categories";
import { cn } from "@/lib/utils";

export function TaskCard({
  task,
  href,
  showRequester = true,
  className,
}: {
  task: TaskSummary;
  href?: string;
  showRequester?: boolean;
  className?: string;
}) {
  const target = href ?? `/app/tasks/${task.id}`;
  return (
    <Card className={cn("group transition-colors hover:border-primary/30", className)}>
      <Link to={target} className="block p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="line-clamp-2 text-sm font-semibold leading-5 group-hover:text-primary">{task.title}</p>
            <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
              {truncate(task.question, 150)}
            </p>
          </div>
          <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={task.status} />
          <Badge tone="neutral">{categoryLabel(task.category)}</Badge>
          {task.isSeed ? <Badge tone="neutral">Seeded</Badge> : null}
          {task.assignment?.isMine ? <Badge tone="accent">Assigned to you</Badge> : null}
          {task.riskLevel === "HIGH" ? <Badge tone="danger">High risk</Badge> : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3" /> {formatDate(task.createdAt)}
            </span>
            {showRequester && task.requester ? (
              <span className="inline-flex items-center gap-1">
                <UserRound className="size-3" /> {task.requester.name}
              </span>
            ) : null}
          </div>
          <span className="text-sm font-semibold tabular-nums">
            {formatMoney(task.rewardMinor, task.currency)}
          </span>
        </div>

        {task.requiredSkills.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {task.requiredSkills.slice(0, 3).map((skill) => (
              <span
                key={skill}
                className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {skill}
              </span>
            ))}
            {task.requiredSkills.length > 3 ? (
              <span className="px-1 text-[10px] text-muted-foreground">
                +{task.requiredSkills.length - 3} more
              </span>
            ) : null}
          </div>
        ) : null}
      </Link>
    </Card>
  );
}
