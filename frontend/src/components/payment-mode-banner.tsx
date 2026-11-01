import { FlaskConical, ShieldCheck, ShieldAlert } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Alert } from "@/components/ui/alert";
import { PayoutAvailabilityBadge } from "@/components/status-badges";

/**
 * Always-visible payment mode banner. The frontend never decides the payment
 * mode: it only renders the mode the server reports.
 */
export function PaymentModeBanner({ compact = false }: { compact?: boolean }) {
  const { data } = useQuery({
    queryKey: ["integrations", "status"],
    queryFn: api.integrations.status,
    staleTime: 60_000,
  });

  if (!data) return null;
  const { paypal } = data;
  const availability =
    paypal.payoutAvailability ??
    (paypal.paymentsMode === "SIMULATED"
      ? "DEMO_SIMULATED"
      : paypal.configured && paypal.payoutsEnabled
        ? "SANDBOX_ENABLED"
        : "PAYOUT_UNAVAILABLE");

  if (paypal.paymentsMode === "SIMULATED") {
    return (
      <Alert
        tone="warning"
        icon={<FlaskConical className="size-4" />}
        className={compact ? "py-2.5" : undefined}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">Demo payments are simulated.</span>
          <PayoutAvailabilityBadge availability={availability} />
          <span className="opacity-90">
            No PayPal money moves. Set DEMO_MODE=false and add Sandbox credentials to make genuine
            Sandbox API calls.
          </span>
        </div>
      </Alert>
    );
  }

  if (paypal.configured) {
    return (
      <Alert
        tone="info"
        icon={<ShieldCheck className="size-4" />}
        className={compact ? "py-2.5" : undefined}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">Genuine PayPal Sandbox mode.</span>
          <PayoutAvailabilityBadge availability={availability} />
          <span className="opacity-90">
            Checkout {paypal.payoutsEnabled ? "and Payouts are" : "is"} enabled.
            {paypal.payoutsEnabled
              ? " No real money is used."
              : " Indian merchant Sandbox accounts support Orders v2 checkout, while Payouts requires separate regional approval (PAYOUT_UNAVAILABLE unless DEMO_MODE=true)."}
          </span>
        </div>
      </Alert>
    );
  }

  return (
    <Alert
      tone="danger"
      icon={<ShieldAlert className="size-4" />}
      className={compact ? "py-2.5" : undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">PayPal Sandbox is requested but not configured.</span>
        <PayoutAvailabilityBadge availability={availability} />
        <span className="opacity-90">
          Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET, or set DEMO_MODE=true for labelled simulated
          payments. See Integrations for setup steps.
        </span>
      </div>
    </Alert>
  );
}
