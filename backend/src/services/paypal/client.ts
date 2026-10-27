import { PayPalError } from "../../lib/errors.js";
import { parseProviderAmount, toPayPalAmount } from "../../lib/money.js";

export const PAYPAL_SANDBOX_BASE_URL = "https://api-m.sandbox.paypal.com";

export type PayPalOrderSnapshot = {
  orderId: string;
  status: string;
  captureId: string | null;
  capturedAmountMinor: number | null;
  currency: string | null;
  referenceId: string | null;
  rawStatus: string;
};

export type PayPalPayoutItem = {
  payoutItemId: string | null;
  senderItemId: string | null;
  transactionStatus: string | null;
  amountMinor: number | null;
  currency: string | null;
};

export type PayPalPayoutBatchSnapshot = {
  batchId: string;
  status: string;
  items: PayPalPayoutItem[];
};

export type CreateOrderInput = {
  amountMinor: number;
  currency: string;
  referenceId: string;
  description: string;
  requestId: string;
};

export type CreatePayoutInput = {
  amountMinor: number;
  currency: string;
  receiverEmail: string;
  senderItemId: string;
  senderBatchId: string;
  note: string;
  emailSubject: string;
  emailMessage: string;
};

/**
 * High-level PayPal gateway. Payment services depend on this interface so the
 * test suite can inject a fake without any network or financial activity.
 */
export interface PayPalGateway {
  createOrder(input: CreateOrderInput): Promise<PayPalOrderSnapshot>;
  captureOrder(orderId: string, requestId: string): Promise<PayPalOrderSnapshot>;
  getOrder(orderId: string): Promise<PayPalOrderSnapshot>;
  createPayout(input: CreatePayoutInput): Promise<{ batchId: string; status: string }>;
  getPayoutBatch(batchId: string): Promise<PayPalPayoutBatchSnapshot>;
  verifyWebhook(
    headers: Record<string, string | undefined>,
    event: unknown,
  ): Promise<boolean>;
}

type FetchLike = typeof fetch;

type ClientOptions = {
  clientId?: string;
  clientSecret?: string;
  webhookId?: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  now?: () => number;
  timeoutMs?: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readCapture(order: Record<string, unknown>): {
  captureId: string | null;
  amountMinor: number | null;
  currency: string | null;
  referenceId: string | null;
} {
  const units = asArray(order.purchase_units);
  const firstUnit = asRecord(units[0]);
  const payments = asRecord(firstUnit.payments);
  const captures = asArray(payments.captures);
  const capture = asRecord(captures[0]);
  const amount = asRecord(capture.amount);
  let amountMinor: number | null = null;
  if (typeof amount.value === "string") {
    try {
      amountMinor = parseProviderAmount(amount.value);
    } catch {
      amountMinor = null;
    }
  }
  return {
    captureId: typeof capture.id === "string" ? capture.id : null,
    amountMinor,
    currency: typeof amount.currency_code === "string" ? amount.currency_code : null,
    referenceId: typeof firstUnit.reference_id === "string" ? firstUnit.reference_id : null,
  };
}

function snapshotFromOrder(order: Record<string, unknown>): PayPalOrderSnapshot {
  const capture = readCapture(order);
  const status = typeof order.status === "string" ? order.status : "UNKNOWN";
  return {
    orderId: String(order.id ?? ""),
    status,
    rawStatus: status,
    captureId: capture.captureId,
    capturedAmountMinor: capture.amountMinor,
    currency: capture.currency,
    referenceId: capture.referenceId,
  };
}

export class PayPalApiClient implements PayPalGateway {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly webhookId: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(options: ClientOptions = {}) {
    this.clientId = options.clientId ?? process.env.PAYPAL_CLIENT_ID ?? "";
    this.clientSecret = options.clientSecret ?? process.env.PAYPAL_CLIENT_SECRET ?? "";
    this.webhookId = options.webhookId ?? process.env.PAYPAL_WEBHOOK_ID ?? "";
    this.baseUrl = options.baseUrl ?? PAYPAL_SANDBOX_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => Date.now());
    this.timeoutMs = options.timeoutMs ?? 20_000;

    if (this.baseUrl !== PAYPAL_SANDBOX_BASE_URL) {
      throw new Error("Only the PayPal Sandbox API base URL is allowed by this build.");
    }
    if (!this.clientId || !this.clientSecret) {
      throw new PayPalError({
        code: "PAYPAL_NOT_CONFIGURED",
        message: "PayPal client credentials are not configured.",
      });
    }
  }

  /** OAuth 2.0 client_credentials grant. Tokens are cached only for their lifetime. */
  async getAccessToken(): Promise<string> {
    if (this.token && this.now() < this.token.expiresAt) {
      return this.token.value;
    }

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: "grant_type=client_credentials",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new PayPalError({
          status: 502,
          code: "PAYPAL_AUTH_FAILED",
          message: `PayPal authentication failed (HTTP ${response.status}). Check the Sandbox Client ID and Secret.`,
          providerStatus: response.status,
          retryable: response.status >= 500 || response.status === 429,
        });
      }

      const payload = asRecord(await response.json());
      const accessToken = payload.access_token;
      const expiresIn = Number(payload.expires_in ?? 0);
      if (typeof accessToken !== "string" || !accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
        throw new PayPalError({
          status: 502,
          code: "PAYPAL_AUTH_INVALID_RESPONSE",
          message: "PayPal returned an invalid OAuth response.",
        });
      }

      // Refresh two minutes before expiry.
      this.token = {
        value: accessToken,
        expiresAt: this.now() + Math.max(30, expiresIn - 120) * 1000,
      };
      return accessToken;
    } catch (error) {
      if (error instanceof PayPalError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new PayPalError({
          code: "PAYPAL_AUTH_TIMEOUT",
          message: "PayPal authentication timed out.",
          retryable: true,
        });
      }
      throw new PayPalError({
        code: "PAYPAL_AUTH_UNREACHABLE",
        message: "PayPal authentication could not be reached.",
        retryable: true,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  invalidateToken(): void {
    this.token = null;
  }

  private async request(
    path: string,
    init: { method: string; body?: unknown; headers?: Record<string, string> },
    retryOnUnauthorized = true,
  ): Promise<Record<string, unknown>> {
    const token = await this.getAccessToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: init.method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(init.headers ?? {}),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
      });

      if (response.status === 401 && retryOnUnauthorized) {
        this.invalidateToken();
        return this.request(path, init, false);
      }

      const text = await response.text();
      let payload: Record<string, unknown> = {};
      if (text) {
        try {
          payload = asRecord(JSON.parse(text));
        } catch {
          payload = {};
        }
      }

      if (!response.ok) {
        const providerCode = typeof payload.name === "string" ? payload.name : `PAYPAL_HTTP_${response.status}`;
        const providerMessage = typeof payload.message === "string" ? payload.message.slice(0, 300) : "";
        const duplicate =
          response.status === 422 &&
          (providerCode === "ORDER_ALREADY_CAPTURED" ||
            /already captured|duplicate sender batch/i.test(providerMessage));

        throw new PayPalError({
          status: response.status === 403 ? 409 : 502,
          code: duplicate ? "PAYPAL_DUPLICATE" : providerCode,
          message: providerMessage
            ? `PayPal rejected the request: ${providerMessage}`
            : `PayPal rejected the request (HTTP ${response.status}).`,
          retryable: response.status >= 500 || response.status === 429,
          providerStatus: response.status,
          providerCode,
        });
      }

      return payload;
    } catch (error) {
      if (error instanceof PayPalError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new PayPalError({
          code: "PAYPAL_TIMEOUT",
          message: "The PayPal request timed out. The outcome is uncertain and must be reconciled before retrying.",
          retryable: true,
        });
      }
      throw new PayPalError({
        code: "PAYPAL_UNREACHABLE",
        message: "PayPal could not be reached. The outcome is uncertain and must be reconciled before retrying.",
        retryable: true,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async createOrder(input: CreateOrderInput): Promise<PayPalOrderSnapshot> {
    const payload = await this.request("/v2/checkout/orders", {
      method: "POST",
      headers: { "PayPal-Request-Id": input.requestId.slice(0, 108) },
      body: {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: input.referenceId,
            custom_id: input.referenceId,
            description: input.description.slice(0, 127),
            amount: {
              currency_code: input.currency,
              value: toPayPalAmount(input.amountMinor),
            },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: "TrustToPay",
              shipping_preference: "NO_SHIPPING",
              user_action: "PAY_NOW",
            },
          },
        },
      },
    });
    return snapshotFromOrder(payload);
  }

  async captureOrder(orderId: string, requestId: string): Promise<PayPalOrderSnapshot> {
    const payload = await this.request(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: "POST",
      headers: { "PayPal-Request-Id": requestId.slice(0, 108) },
      body: {},
    });
    return snapshotFromOrder(payload);
  }

  async getOrder(orderId: string): Promise<PayPalOrderSnapshot> {
    const payload = await this.request(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
      method: "GET",
    });
    return snapshotFromOrder(payload);
  }

  async createPayout(input: CreatePayoutInput): Promise<{ batchId: string; status: string }> {
    const payload = await this.request("/v1/payments/payouts", {
      method: "POST",
      body: {
        sender_batch_header: {
          sender_batch_id: input.senderBatchId.slice(0, 256),
          email_subject: input.emailSubject.slice(0, 255),
          email_message: input.emailMessage.slice(0, 1000),
        },
        items: [
          {
            recipient_type: "EMAIL",
            amount: {
              value: toPayPalAmount(input.amountMinor),
              currency: input.currency,
            },
            receiver: input.receiverEmail,
            note: input.note.slice(0, 255),
            sender_item_id: input.senderItemId.slice(0, 63),
          },
        ],
      },
    });

    const batchHeader = asRecord(payload.batch_header);
    const batchId = batchHeader.payout_batch_id;
    if (typeof batchId !== "string" || !batchId) {
      throw new PayPalError({
        code: "PAYPAL_PAYOUT_INVALID_RESPONSE",
        message: "PayPal did not return a payout batch reference.",
      });
    }
    return {
      batchId,
      status: typeof batchHeader.batch_status === "string" ? batchHeader.batch_status : "UNKNOWN",
    };
  }

  async getPayoutBatch(batchId: string): Promise<PayPalPayoutBatchSnapshot> {
    const payload = await this.request(`/v1/payments/payouts/${encodeURIComponent(batchId)}`, {
      method: "GET",
    });
    const items = asArray(payload.items).map((item) => {
      const record = asRecord(item);
      const payoutItem = asRecord(record.payout_item);
      const amount = asRecord(payoutItem.amount ?? record.amount);
      let amountMinor: number | null = null;
      if (typeof amount.value === "string") {
        try {
          amountMinor = parseProviderAmount(amount.value);
        } catch {
          amountMinor = null;
        }
      }
      return {
        payoutItemId: typeof record.payout_item_id === "string" ? record.payout_item_id : null,
        senderItemId: typeof payoutItem.sender_item_id === "string" ? payoutItem.sender_item_id : null,
        transactionStatus:
          typeof record.transaction_status === "string" ? record.transaction_status : null,
        amountMinor,
        currency: typeof amount.currency_code === "string" ? amount.currency_code : null,
      };
    });

    const batchHeader = asRecord(payload.batch_header);
    return {
      batchId,
      status: typeof batchHeader.batch_status === "string" ? batchHeader.batch_status : "UNKNOWN",
      items,
    };
  }

  /** Official webhook signature verification endpoint. */
  async verifyWebhook(headers: Record<string, string | undefined>, event: unknown): Promise<boolean> {
    if (!this.webhookId) {
      throw new PayPalError({
        status: 503,
        code: "PAYPAL_WEBHOOK_NOT_CONFIGURED",
        message: "PAYPAL_WEBHOOK_ID is not configured, so webhook signatures cannot be verified.",
      });
    }

    const authAlgo = headers["paypal-auth-algo"];
    const certUrl = headers["paypal-cert-url"];
    const transmissionId = headers["paypal-transmission-id"];
    const transmissionSig = headers["paypal-transmission-sig"];
    const transmissionTime = headers["paypal-transmission-time"];

    if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
      throw new PayPalError({
        status: 400,
        code: "WEBHOOK_HEADERS_MISSING",
        message: "PayPal webhook verification headers are missing.",
      });
    }

    const payload = await this.request("/v1/notifications/verify-webhook-signature", {
      method: "POST",
      body: {
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: this.webhookId,
        webhook_event: event,
      },
    });

    return payload.verification_status === "SUCCESS";
  }
}

let gatewayOverride: PayPalGateway | null = null;

export function setPayPalGatewayForTests(gateway: PayPalGateway | null): void {
  gatewayOverride = gateway;
}

export function getPayPalGateway(): PayPalGateway {
  if (gatewayOverride) return gatewayOverride;
  return new PayPalApiClient();
}
