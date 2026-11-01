import { Link } from "react-router-dom";
import { ArrowLeft, Database, Lock, Mail, ShieldCheck, Trash2 } from "lucide-react";
import { PublicHeader, MarketingFooter } from "@/components/layout/public-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-[#080C14] text-[#F1F5F9]">
      <PublicHeader />
      <main className="container max-w-3xl py-12">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#3B82F6]">
          Data Governance &amp; Privacy
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-[#F1F5F9]">
          Privacy &amp; Data Handling Notice
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#94A3B8]">
          This notice documents the data models, session credentials, and external provider payloads processed by the
          TrustToPay platform during operation.
        </p>

        <div className="mt-8 space-y-4">
          <Card>
            <CardContent className="space-y-3 p-5">
              <h2 className="flex items-center gap-2 text-base font-semibold text-[#F1F5F9]">
                <Database className="size-4 text-[#3B82F6]" /> Data stored by the platform
              </h2>
              <ul className="list-disc space-y-1.5 pl-5 text-sm leading-6 text-[#94A3B8]">
                <li>Account records: name, email, role, password hash, specialist approval status, and profile metadata.</li>
                <li>Specialist payout profile: PayPal Sandbox recipient email, explicit consent flag, and provider type.</li>
                <li>
                  Agent sessions: technical questions, product models, specifications, supplied evidence documents, and
                  schema-validated analysis runs.
                </li>
                <li>
                  Escalated tasks: acceptance criteria, immutable SHA-256 code artifacts, submissions, verification
                  checklists, security scan reports, disputes, and timeline events.
                </li>
                <li>
                  Payment ledger metadata: local transaction IDs, PayPal order/batch identifiers, minor-unit amounts,
                  currencies, statuses, and reconciliation logs.
                </li>
                <li>Immutable audit trail entries for administrative and lifecycle transitions.</li>
              </ul>
              <p className="text-sm leading-6 text-[#94A3B8]">
                Payment card numbers and bank credentials are never collected or stored by TrustToPay. In PayPal Sandbox
                mode, PayPal hosts the checkout flow and the server records only the order and payout batch references
                required for reconciliation.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-5">
              <h2 className="flex items-center gap-2 text-base font-semibold text-[#F1F5F9]">
                <Lock className="size-4 text-[#3B82F6]" /> Authentication &amp; session storage
              </h2>
              <p className="text-sm leading-6 text-[#94A3B8]">
                TrustToPay authenticates requests using a signed JWT session token stored in an{" "}
                <code className="font-mono text-xs text-[#F1F5F9]">httpOnly</code> session cookie and an authenticated
                session bearer token. The platform does not load third-party advertising trackers or behavioral
                analytics. The official PayPal JS SDK is loaded on demand only when a PayPal Sandbox funding dialog is
                opened.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-5">
              <h2 className="flex items-center gap-2 text-base font-semibold text-[#F1F5F9]">
                <Trash2 className="size-4 text-[#3B82F6]" /> Retention &amp; environment isolation
              </h2>
              <p className="text-sm leading-6 text-[#94A3B8]">
                Application records are persisted in the relational database configured by{" "}
                <code className="font-mono text-xs text-[#F1F5F9]">DATABASE_URL</code>. Operators deploying the
                platform control database retention, backups, and index synchronization with Elasticsearch.
              </p>
              <p className="text-sm leading-6 text-[#94A3B8]">
                Do not submit live production secrets, regulated personal data, or live financial credentials into a
                Sandbox or evaluation deployment.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-5">
              <h2 className="flex items-center gap-2 text-base font-semibold text-[#F1F5F9]">
                <ShieldCheck className="size-4 text-[#3B82F6]" /> External service integrations
              </h2>
              <p className="text-sm leading-6 text-[#94A3B8]">
                When PayPal Sandbox mode is enabled, order creation, order capture, payout batch creation, and webhook
                signature verification calls are sent to PayPal Sandbox endpoints. When Gemini or an external AI
                provider is configured on the server, bounded task or security review inputs are transmitted server-side.
                When Elastic is configured, only non-sensitive specialist skill profiles and task matching summaries are
                indexed.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-5">
              <h2 className="flex items-center gap-2 text-base font-semibold text-[#F1F5F9]">
                <Mail className="size-4 text-[#3B82F6]" /> Support &amp; security inquiries
              </h2>
              <p className="text-sm leading-6 text-[#94A3B8]">
                Visit the operational support and security disclosure page for guidance on troubleshooting environment
                configuration or reporting security findings.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/contact">Support &amp; security</Link>
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <Link to="/">
                    <ArrowLeft className="size-3.5" /> Back to home
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
