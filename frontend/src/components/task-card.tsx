import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import type { TaskSummary } from "@/lib/types";
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
  const pendingOffer = task.myOffer?.status === "PENDING" ? task.myOffer : null;

  return (
    <Card
      className={cn(
        "group border-border bg-card transition-colors duration-150 hover:border-primary/40 hover:bg-secondary/40",
        pendingOffer && "border-primary/40",
        className,
      )}
    >
      <Link to={target} className="block p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{categoryLabel(task.category)}</span>
              {task.minimumSkillLevel ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Level {task.minimumSkillLevel} Required</span>
                </>
              ) : null}
              {task.assignment?.isMine ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-emerald-400">Assigned to you</span>
                </>
              ) : null}
              {pendingOffer ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-blue-400">Direct Offer #{pendingOffer.rank}</span>
                </>
              ) : null}
            </div>
            <h3 className="line-clamp-1 font-display text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
              {task.title}
            </h3>
            <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
              {truncate(task.question, 155)}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
              {formatMoney(task.rewardMinor, task.currency)}
            </span>
            <ArrowUpRight className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <StatusBadge status={task.status} />
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{formatDate(task.createdAt)}</span>
            {showRequester && task.requester ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{task.requester.name}</span>
              </>
            ) : null}
          </div>

          {task.requiredSkills.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              {task.requiredSkills.slice(0, 3).map((skill, idx) => (
                <span key={skill} className="inline-flex items-center gap-1.5">
                  {idx > 0 ? <span aria-hidden="true">·</span> : null}
                  <span className="font-mono text-foreground/85">{skill}</span>
                </span>
              ))}
              {task.requiredSkills.length > 3 ? (
                <span>+{task.requiredSkills.length - 3}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </Link>
    </Card>
  );
}
