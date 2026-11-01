import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, CreditCard, ExternalLink, FlaskConical, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { Payment } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PayPalSdk = {
  Buttons: (options: {
    style?: Record<string, unknown>;
    createOrder: () => Promise<string>;
    onApprove: (data: { orderID: string }) => Promise<void>;
    onError: (error: unknown) => void;
    onCancel?: () => void;
  }) => { render: (target: HTMLElement) => void; close?: () => void };
};

declare global {
  interface Window {
    paypal?: PayPalSdk;
  }
}

let sdkPromise: Promise<PayPalSdk> | null = null;
let sdkKey = "";

function loadPayPalSdk(clientId: string, currency: string): Promise<PayPalSdk> {
  const key = `${clientId}:${currency}`;
  if (sdkPromise && sdkKey === key) return sdkPromise;
  sdkKey = key;
  const promise = new Promise<PayPalSdk>((resolve, reject) => {
    if (window.paypal) {
      resolve(window.paypal);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>("script[data-trusttopay-paypal]");
    if (existing) existing.remove();
    const script = document.createElement("script");
    script.dataset.trusttopayPaypal = "true";
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}&intent=capture&components=buttons`;
    script.async = true;
    script.onload = () => {
      if (window.paypal) resolve(window.paypal);
      else reject(new Error("The PayPal JS SDK loaded but did not expose the Buttons component."));
    };
    script.onerror = () => reject(new Error("The PayPal JS SDK could not be loaded. Check your network connection."));
    document.head.appendChild(script);
  });
  const wrapped = promise.catch((error) => {
    sdkPromise = null;
    throw error;
  });
  sdkPromise = wrapped;
  return wrapped;
}

export function PayPalCheckout({
  taskId,
  amountDisplay,
  currency = "USD",
  onCompleted,
  label,
}: {
  taskId: string;
  amountDisplay: string;
  currency?: string;
  onCompleted: () => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const buttonsRef = useRef<HTMLDivElement>(null);
  const renderedFor = useRef<string | null>(null);

  const createOrder = useMutation({
    mutationFn: () => api.payments.createOrder(taskId),
  });

  const capture = useMutation({
    mutationFn: (orderId: string) => api.payments.capture(orderId),
    onSuccess: (data) => {
      setSuccess(data.message);
      setError(null);
      onCompleted();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "The payment capture failed.");
    },
  });

  const order = createOrder.data;
  const mode = order?.paypal.mode ?? "SIMULATED";

  const start = useCallback(() => {
    setError(null);
    setSuccess(null);
    renderedFor.current = null;
    createOrder.mutate(undefined, {
      onSuccess: () => setOpen(true),
      onError: (err) => setError(err instanceof ApiError ? err.message : "Could not create a funding order."),
    });
  }, [createOrder]);

  useEffect(() => {
    if (!open || !order || order.paypal.mode !== "SANDBOX" || !order.paypal.orderId) return;
    const clientId = order.paypal.clientId;
    if (!clientId) {
      setSdkError("The server did not expose a PayPal client ID. Check the Sandbox configuration.");
      return;
    }
    if (!buttonsRef.current) return;
    if (renderedFor.current === order.paypal.orderId) return;
    let cancelled = false;
    setSdkError(null);
    buttonsRef.current.innerHTML = "";

    loadPayPalSdk(clientId, order.paypal.currency)
      .then((sdk) => {
        if (cancelled || !buttonsRef.current) return;
        buttonsRef.current.innerHTML = "";
        const buttons = sdk.Buttons({
          style: { layout: "vertical", shape: "rect", label: "paypal", height: 42 },
          createOrder: async () => order.paypal.orderId as string,
          onApprove: async (data) => {
            capture.mutate(data.orderID);
          },
          onError: (sdkFailure) => {
            setSdkError(
              sdkFailure instanceof Error
                ? sdkFailure.message
                : "The PayPal checkout could not be completed in this browser.",
            );
          },
        });
        buttons.render(buttonsRef.current);
        renderedFor.current = order.paypal.orderId;
      })
      .catch((reason: Error) => {
        if (!cancelled) setSdkError(reason.message);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order?.paypal.orderId, order?.paypal.clientId, order?.paypal.mode]);

  return (
    <>
      <div className="space-y-2">
        <Button type="button" onClick={start} loading={createOrder.isPending} className="w-full sm:w-auto">
          <CreditCard className="size-4" />
          {label ?? `Fund ${amountDisplay} with PayPal`}
        </Button>
        {error && !open ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (capture.isPending) return;
          setOpen(next);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {mode === "SIMULATED" ? (
                <FlaskConical className="size-5 text-amber-600" />
              ) : (
                <ShieldCheck className="size-5 text-blue-600" />
              )}
              {mode === "SIMULATED" ? "Simulated payment approval" : "PayPal Sandbox checkout"}
            </DialogTitle>
            <DialogDescription>
              {mode === "SIMULATED"
                ? "This is a demo payment. No PayPal account is charged and no money moves."
                : "You are paying in the PayPal Sandbox. No real money moves, but the server makes genuine PayPal Orders v2 API calls."}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Review reward funding</span>
              <span className="font-semibold tabular-nums">{amountDisplay}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Currency</span>
              <span className="font-mono">{order?.paypal.currency ?? currency}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>Provider order</span>
              <span className="truncate font-mono">{order?.paypal.orderId ?? "—"}</span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Badge tone={mode === "SIMULATED" ? "warning" : "info"} dot>
                {mode === "SIMULATED" ? "Simulated" : "PayPal Sandbox"}
              </Badge>
              {mode === "SANDBOX" ? (
                <a
                  href={`https://www.sandbox.paypal.com/checkoutnow?token=${encodeURIComponent(order?.paypal.orderId ?? "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-primary underline underline-offset-2"
                >
                  Open in PayPal <ExternalLink className="size-3" />
                </a>
              ) : null}
            </div>
          </div>

          {success ? (
            <Alert tone="success" icon={<CheckCircle2 className="size-4" />}>
              {success}
            </Alert>
          ) : null}
          {error ? (
            <Alert tone="danger" icon={<ShieldAlert className="size-4" />}>
              {error}
            </Alert>
          ) : null}
          {sdkError ? (
            <Alert tone="danger" icon={<ShieldAlert className="size-4" />}>
              {sdkError}
            </Alert>
          ) : null}

          {mode === "SIMULATED" ? (
            <>
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-200">
                Demo approval records a simulated capture with a <code>DEMO-CAPTURE</code> reference. The ledger
                marks it as simulated. Switch to <code>DEMO_MODE=false</code> with Sandbox credentials for the
                genuine PayPal flow.
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={capture.isPending}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => order?.paypal.orderId && capture.mutate(order.paypal.orderId)}
                  loading={capture.isPending}
                >
                  <FlaskConical className="size-4" /> Simulate approval
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div ref={buttonsRef} className="min-h-[48px] rounded-md" />
              {capture.isPending ? (
                <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Confirming the capture with the server…
                </p>
              ) : null}
              <p className="text-[11px] leading-5 text-muted-foreground">
                The browser never decides success. The server captures the order with PayPal and compares the
                captured amount, currency and task reference before funding the task.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
