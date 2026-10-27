import { Badge } from "@/components/ui/badge";
import { humanize, paymentTone, taskStatusTone, verificationTone } from "@/lib/format";

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

export function RiskBadge({ risk }: { risk: string }) {
  return (
    <Badge tone={risk === "HIGH" ? "danger" : "neutral"} dot>
      {risk === "HIGH" ? "High risk" : "Standard risk"}
    </Badge>
  );
}
