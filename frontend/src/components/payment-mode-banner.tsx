import { FlaskConical, ShieldCheck, ShieldAlert } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Alert } from "@/components/ui/alert";

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

  if (paypal.paymentsMode === "SIMULATED") {
    return (
      <Alert
        tone="warning"
        icon={<FlaskConical className="size-4" />}
        className={compact ? "py-2.5" : undefined}
      >
        <span className="font-medium">Demo payments are simulated.</span>{" "}
        <span className="opacity-90">
          No PayPal money moves. Set DEMO_MODE=false and add Sandbox credentials to make genuine
          Sandbox API calls.
        </span>
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
        <span className="font-medium">Genuine PayPal Sandbox mode.</span>{" "}
        <span className="opacity-90">
          Checkout {paypal.payoutsEnabled ? "and Payouts are" : "is"} enabled.
          {paypal.payoutsEnabled ? "" : " Reviewer payouts need Payouts access."} No real money is used.
        </span>
      </Alert>
    );
  }

  return (
    <Alert
      tone="danger"
      icon={<ShieldAlert className="size-4" />}
      className={compact ? "py-2.5" : undefined}
    >
      <span className="font-medium">PayPal Sandbox is requested but not configured.</span>{" "}
      <span className="opacity-90">
        Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET, or set DEMO_MODE=true for labelled simulated
        payments. See Integrations for setup steps.
      </span>
    </Alert>
  );
}
