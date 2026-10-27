import { Link } from "react-router-dom";
import { ArrowLeft, Database, Lock, Mail, ShieldCheck, Trash2 } from "lucide-react";
import { PublicHeader, MarketingFooter } from "@/components/layout/public-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-background">
      <PublicHeader />
      <main className="container max-w-3xl py-12">
        <Badge tone="warning">Hackathon privacy notice</Badge>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Privacy notice</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This is a self-hosted hackathon reference implementation, not a hosted commercial service. This notice
          describes what the software stores when you run it. It is not legal advice.
        </p>

        <div className="mt-8 space-y-5">
          <Card>
            <CardContent className="space-y-3 p-5">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Database className="size-4 text-primary" /> Data the app stores
              </h2>
              <ul className="list-disc space-y-1.5 pl-5 text-sm leading-6 text-muted-foreground">
                <li>Account details: name, email, role, password hash, reviewer approval and profile fields.</li>
                <li>Reviewer payout details: PayPal email, consent flag and payout provider.</li>
                <li>
                  Agent sessions: questions, product models, specifications, supplied evidence documents and
                  analysis output.
                </li>
                <li>
                  Review tasks: acceptance criteria, submissions, evidence notes, verification checks, disputes and
                  timeline events.
                </li>
                <li>
                  Payment metadata: local transaction references, provider order/batch identifiers, amounts,
                  currencies, statuses and failure messages.
                </li>
                <li>Audit events for lifecycle and administrative actions.</li>
              </ul>
              <p className="text-sm leading-6 text-muted-foreground">
                Payment card or bank details are never collected by this app. In genuine Sandbox mode, PayPal handles
                the checkout interaction. The server stores only the provider references and amounts it needs to
                reconcile the reward.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-5">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Lock className="size-4 text-primary" /> Cookies and sessions
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                A single httpOnly, SameSite=Lax session cookie keeps you signed in. It contains a signed session token,
                not your password. The app does not use advertising cookies or third-party analytics. The PayPal JS SDK
                is loaded only when a genuine Sandbox checkout dialog is opened.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-5">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Trash2 className="size-4 text-primary" /> Retention and control
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Data lives in the local SQLite database configured by <code>DATABASE_URL</code>. Removing the database
                removes the demo data. There is no automated retention schedule, export workflow or account-deletion
                endpoint in this build. An operator running the app is responsible for its data.
              </p>
              <p className="text-sm leading-6 text-muted-foreground">
                Do not enter real personal data, confidential documents, or production PayPal credentials into a demo
                instance. Use Sandbox accounts and fictional evidence.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-5">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <ShieldCheck className="size-4 text-primary" /> Sharing
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                The app does not sell data and does not include a third-party analytics SDK. When genuine Sandbox mode
                is enabled, payment-related requests are sent to PayPal for order creation, capture, payout creation,
                payout reconciliation and webhook signature verification. An optional AI provider configured by the
                operator receives the analysis input. No provider is contacted in the default demo configuration.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-5">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Mail className="size-4 text-primary" /> Questions
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                This build has no monitored support inbox. Use the contact page for guidance on where to raise setup,
                privacy or security questions in your evaluation environment.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/contact">Contact and support</Link>
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <Link to="/">
                    <ArrowLeft className="size-3.5" /> Back to site
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
