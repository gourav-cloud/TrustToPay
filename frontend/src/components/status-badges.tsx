import { Badge } from "@/components/ui/badge";
import { humanize, paymentTone, taskStatusTone, verificationTone } from "@/lib/format";
import type { PayoutAvailability } from "@/lib/types";

export function StatusBadge({ status, dot = true }: { status: string; dot?: boolean }) {
  return (
    <Badge tone={taskStatusTone(status)} dot={dot}>
      {humanize(status)}
    </Badge>
  );
}

export function VerificationBadge({ status }: { status: string }) {
  return (
    <Badge tone={verificationTone(status)} dot>
      {humanize(status)}
    </Badge>
  );
}

export function PaymentStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={paymentTone(status)} dot>
      {humanize(status)}
    </Badge>
  );
}

export function ModeBadge({ mode }: { mode: "SIMULATED" | "SANDBOX" }) {
  return mode === "SIMULATED" ? (
    <Badge tone="warning" dot>
      Simulated
    </Badge>
  ) : (
    <Badge tone="info" dot>
      PayPal Sandbox
    </Badge>
  );
}

export function PayoutAvailabilityBadge({
  availability,
}: {
  availability: PayoutAvailability | undefined;
}) {
  if (availability === "DEMO_SIMULATED") {
    return (
      <Badge tone="warning" data-availability="DEMO_SIMULATED">
        Simulated Payouts
      </Badge>
    );
  }
  if (availability === "PAYOUT_UNAVAILABLE") {
    return (
      <Badge tone="danger" data-availability="PAYOUT_UNAVAILABLE">
        Payout Unavailable
      </Badge>
    );
  }
  return (
    <Badge tone="info" data-availability="SANDBOX_ENABLED">
      Sandbox Payouts
    </Badge>
  );
}

export function SecurityVerdictBadge({ verdict }: { verdict: string }) {
  const tone =
    verdict === "PASS"
      ? "success"
      : verdict === "NEEDS_HUMAN_REVIEW"
        ? "warning"
        : "danger";
  const label =
    verdict === "PASS"
      ? "Passed"
      : verdict === "NEEDS_HUMAN_REVIEW"
        ? "Needs Review"
        : verdict === "BLOCK"
          ? "Blocked"
          : humanize(verdict);
  return (
    <Badge tone={tone} data-verdict={verdict}>
      {label}
    </Badge>
  );
}

export function RiskBadge({ risk }: { risk: string }) {
  return (
    <Badge tone={risk === "HIGH" ? "danger" : "neutral"}>
      {risk === "HIGH" ? "High risk" : "Standard risk"}
    </Badge>
  );
}

export function skillLevelLabel(level: number): string {
  if (level >= 3) return "L3 Expert";
  if (level === 2) return "L2 Practitioner";
  return "L1 Foundation";
}

export function SkillLevelBadge({ name, level }: { name?: string; level: number }) {
  const normalizedLevel = level >= 3 ? 3 : level === 2 ? 2 : 1;
  const tone = normalizedLevel === 3 ? "success" : normalizedLevel === 2 ? "info" : "accent";
  const label = skillLevelLabel(normalizedLevel);
  return (
    <Badge tone={tone}>
      {name ? `${name} · ${label}` : label}
    </Badge>
  );
}
