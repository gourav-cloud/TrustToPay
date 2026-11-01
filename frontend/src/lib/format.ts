export function formatMoney(minor: number, currency = "USD"): string {
  const safe = Number.isFinite(minor) ? minor : 0;
  const major = Math.floor(Math.abs(safe) / 100);
  const cents = String(Math.abs(safe) % 100).padStart(2, "0");
  const sign = safe < 0 ? "-" : "";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
      Number(`${sign}${major}.${cents}`),
    );
  } catch {
    return `${sign}$${major}.${cents}`;
  }
}

/** Parse a decimal string from a form ("15.50") into integer minor units. */
export function parseMoneyToMinor(input: string): number | null {
  const cleaned = input.trim().replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  return Number.parseInt(whole, 10) * 100 + Number.parseInt(`${fraction}00`.slice(0, 2), 10);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDateShort(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function timeAgo(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDateShort(date.toISOString());
}

export function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

export function taskStatusTone(status: string): Tone {
  switch (status) {
    case "COMPLETED":
    case "PAYMENT_PAID":
    case "VERIFIED":
    case "HANDED_OFF":
    case "ORIGINAL_TASK_RESUMED":
      return "success";
    case "PAYMENT_READY":
    case "FUNDED":
    case "OFFERED":
    case "VERIFICATION_PENDING":
    case "UNDER_VERIFICATION":
    case "AI_ANALYSIS":
      return "info";
    case "AWAITING_FUNDING":
    case "AWAITING_INFORMATION":
    case "REVIEW_TASK_CREATED":
    case "ESCALATION_REQUIRED":
    case "NEEDS_MANUAL_REVIEW":
    case "DISPUTED":
      return "warning";
    case "FUNDING_FAILED":
    case "PAYOUT_FAILED":
    case "VERIFICATION_REJECTED":
    case "NEEDS_REVISION":
    case "CANCELLED":
    case "EXPIRED":
      return "danger";
    case "PAYMENT_PROCESSING":
    case "REVIEWER_ASSIGNED":
    case "ASSIGNED":
    case "IN_PROGRESS":
    case "SUBMISSION_RECEIVED":
    case "SUBMITTED":
      return "accent";
    default:
      return "neutral";
  }
}

export function verificationTone(status: string): Tone {
  if (status === "PASSED") return "success";
  if (status === "REJECTED") return "danger";
  if (status === "NEEDS_MANUAL_REVIEW") return "warning";
  return "info";
}

export function paymentTone(status: string): Tone {
  switch (status) {
    case "COMPLETED":
    case "PAID":
    case "SUCCESS":
      return "success";
    case "PROCESSING":
    case "PENDING":
    case "APPROVED":
    case "CREATED":
      return "info";
    case "FAILED":
    case "CANCELLED":
    case "DENIED":
      return "danger";
    default:
      return "neutral";
  }
}

export function confidenceLabel(score: number): { label: string; tone: Tone } {
  if (score >= 0.75) return { label: "Above threshold", tone: "success" };
  if (score >= 0.5) return { label: "Low confidence", tone: "warning" };
  return { label: "Very low confidence", tone: "danger" };
}

export function truncate(value: string, length = 140): string {
  if (value.length <= length) return value;
  return `${value.slice(0, length - 1).trimEnd()}…`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
