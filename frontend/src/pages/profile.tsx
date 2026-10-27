import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  BriefcaseBusiness,
  CheckCircle2,
  CircleAlert,
  Mail,
  Save,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wallet,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, SectionHeading, DataRow } from "@/components/common";
import { PaymentModeBanner } from "@/components/payment-mode-banner";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { LoadingBlock } from "@/components/ui/states";
import { formatDate, humanize } from "@/lib/format";

type SkillDraft = { name: string };

export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const [headline, setHeadline] = useState(user?.profile?.headline ?? "");
  const [bio, setBio] = useState(user?.profile?.bio ?? "");
  const [payoutEmail, setPayoutEmail] = useState(user?.profile?.payoutEmail ?? "");
  const [consent, setConsent] = useState(user?.profile?.payoutConsent ?? false);
  const [timezone, setTimezone] = useState(user?.profile?.timezone ?? "UTC");
  const [skills, setSkills] = useState<SkillDraft[]>(
    (user?.skills ?? []).map((skill) => ({ name: skill.name })),
  );

  useEffect(() => {
    if (!user) return;
    setHeadline(user.profile?.headline ?? "");
    setBio(user.profile?.bio ?? "");
    setPayoutEmail(user.profile?.payoutEmail ?? "");
    setConsent(user.profile?.payoutConsent ?? false);
    setTimezone(user.profile?.timezone ?? "UTC");
    setSkills((user.skills ?? []).map((skill) => ({ name: skill.name })));
  }, [user]);

  const reviewerDashboard = useQuery({
    queryKey: ["dashboard", "reviewer"],
    queryFn: api.dashboards.reviewer,
    enabled: user?.role === "REVIEWER" || user?.role === "ADMIN",
  });

  const save = useMutation({
    mutationFn: () =>
      api.users.updatePayout({
        headline: headline.trim() || null,
        bio: bio.trim() || null,
        payoutEmail: payoutEmail.trim() || null,
        payoutConsent: consent,
        timezone: timezone.trim() || "UTC",
        skills: skills.map((skill) => skill.name.trim()).filter(Boolean),
      }),
    onSuccess: async () => {
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setSaved("Your profile was saved.");
      setError(null);
    },
    onError: (err) => {
      setSaved(null);
      setError(err instanceof ApiError ? err.message : "Could not save your profile.");
    },
  });

  if (!user) return <LoadingBlock label="Loading your profile..." />;

  const reviewer = user.role === "REVIEWER";
  const ready = Boolean(payoutEmail.trim() && consent);
  const stats = reviewerDashboard.data;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaved(null);
    setError(null);
    if (consent && !payoutEmail.trim()) {
      setError("Record a PayPal payout email before giving consent.");
      return;
    }
    if (payoutEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payoutEmail.trim())) {
      setError("Enter a valid PayPal email address.");
      return;
    }
    save.mutate();
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Account"
        title={reviewer ? "Reviewer profile and payout details" : "Your profile"}
        description={
          reviewer
            ? "Your skills help requesters understand your expertise. A PayPal email and explicit consent are required before a verified reward can be paid."
            : "Keep your account details up to date. Requesters and admins use them to identify who created or reviewed a task."
        }
        actions={
          reviewer ? (
            <Button asChild variant="outline">
              <Link to="/app/earnings">
                <Wallet className="size-4" /> Earnings
              </Link>
            </Button>
          ) : null
        }
      />

      <PaymentModeBanner compact />

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <form onSubmit={submit} className="space-y-5">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {saved ? (
            <Alert tone="success" icon={<CheckCircle2 className="size-4" />}>
              {saved}
            </Alert>
          ) : null}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <UserRound className="size-4 text-primary" /> Public profile
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name" htmlFor="profile-name" hint="Contact support to change your name.">
                  <Input id="profile-name" value={user.name} readOnly disabled />
                </Field>
                <Field label="Email" htmlFor="profile-email" hint="Used to sign in.">
                  <Input id="profile-email" value={user.email} readOnly disabled />
                </Field>
              </div>
              <Field
                label="Headline"
                htmlFor="profile-headline"
                hint="Short summary shown on your reviewer profile. Max 160 characters."
              >
                <Input
                  id="profile-headline"
                  value={headline}
                  onChange={(event) => setHeadline(event.target.value)}
                  placeholder="Software, crypto or hardware specialist"
                  maxLength={160}
                />
              </Field>
              <Field
                label="Bio"
                htmlFor="profile-bio"
                hint="Describe the evidence you normally use and the questions you can verify."
              >
                <Textarea
                  id="profile-bio"
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  rows={5}
                  maxLength={2000}
                  placeholder="I verify power-delivery claims against manufacturer documentation and per-port limits."
                />
              </Field>
              <Field label="Timezone" htmlFor="profile-timezone" hint="Used for display only. Example: Europe/London.">
                <Input
                  id="profile-timezone"
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                  placeholder="UTC"
                  maxLength={80}
                />
              </Field>

              {reviewer ? (
                <div className="space-y-2">
                  <SectionHeading
                    title="Reviewer skills"
                    description="Up to 12 skills. These appear on tasks and in the marketplace."
                    actions={
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSkills((current) => (current.length >= 12 ? current : [...current, { name: "" }]))}
                        disabled={skills.length >= 12}
                      >
                        <Sparkles className="size-3.5" /> Add skill
                      </Button>
                    }
                  />
                  {skills.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                      No skills yet. Add at least one so requesters can judge whether the task fits you.
                    </p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {skills.map((skill, index) => (
                        <div key={index} className="flex gap-2">
                          <Input
                            value={skill.name}
                            onChange={(event) =>
                              setSkills((current) =>
                                current.map((item, position) =>
                                  position === index ? { name: event.target.value } : item,
                                ),
                              )
                            }
                            placeholder="USB Power Delivery"
                            maxLength={80}
                            aria-label={`Skill ${index + 1}`}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove skill ${index + 1}`}
                            onClick={() => setSkills((current) => current.filter((_, position) => position !== index))}
                          >
                            <CircleAlert className="size-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>

          {reviewer ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Wallet className="size-4 text-primary" /> PayPal payout details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert tone="info">
                  In demo mode, payouts are simulated and labelled. In genuine Sandbox mode, the server calls PayPal
                  Payouts only after independent verification passes. No live-money endpoint is reachable.
                </Alert>
                <Field
                  label="PayPal email"
                  htmlFor="profile-payout-email"
                  hint="Use a verified PayPal account email. In Sandbox mode, use a Sandbox account email."
                >
                  <Input
                    id="profile-payout-email"
                    type="email"
                    value={payoutEmail}
                    onChange={(event) => setPayoutEmail(event.target.value)}
                    placeholder="reviewer@example.com"
                    maxLength={200}
                  />
                </Field>
                <label className="flex items-start gap-2.5 rounded-md border border-border bg-muted/30 p-3 text-xs leading-5">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                    className="mt-0.5 size-4 accent-primary"
                  />
                  <span>
                    I consent to receive reviewer rewards at this PayPal email after a submission passes independent
                    verification. I understand that a failed or disputed task is not payable.
                  </span>
                </label>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge tone={ready ? "success" : "warning"} dot>
                    {ready ? "Payout profile ready" : "Payout profile incomplete"}
                  </Badge>
                  {stats ? (
                    <span className="text-[11px] text-muted-foreground">
                      {stats.completedPayoutCount} completed payout{stats.completedPayoutCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="max-w-md text-[11px] leading-5 text-muted-foreground">
              Consent is stored with the profile and checked again by the server before a payout. It is not inferred
              from the presence of an email.
            </p>
            <Button type="submit" loading={save.isPending}>
              <Save className="size-4" /> Save profile
            </Button>
          </div>
        </form>

        <aside className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Account</CardTitle>
            </CardHeader>
            <CardContent>
              <dl>
                <DataRow label="Role">
                  <Badge tone={user.role === "ADMIN" ? "accent" : user.role === "REVIEWER" ? "info" : "neutral"}>
                    {humanize(user.role)}
                  </Badge>
                </DataRow>
                <DataRow label="Reviewer approval">
                  {user.role === "REVIEWER" ? (
                    <Badge tone={user.isReviewerApproved ? "success" : "warning"} dot>
                      {user.isReviewerApproved ? "Approved" : "Pending"}
                    </Badge>
                  ) : (
                    "Not applicable"
                  )}
                </DataRow>
                <DataRow label="Member since">{formatDate(user.createdAt)}</DataRow>
                <DataRow label="Payout provider">{user.profile?.payoutProvider ?? "PAYPAL_SANDBOX"}</DataRow>
                <DataRow label="Consent">{consent ? "Recorded" : "Not given"}</DataRow>
              </dl>
            </CardContent>
          </Card>

          {reviewer ? (
            <Card className={ready ? "border-emerald-200" : "border-amber-200"}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  {ready ? (
                    <BadgeCheck className="size-4 text-emerald-700" />
                  ) : (
                    <Mail className="size-4 text-amber-700" />
                  )}
                  Payout readiness
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs leading-5 text-muted-foreground">
                {ready ? (
                  <p>
                    The server can create a payout for a verified reward. Every payout is recorded in the ledger with
                    a Simulated or Sandbox label.
                  </p>
                ) : (
                  <p>
                    Add a PayPal email and record consent. Until both are present, a verified reward stays authorized
                    and is never silently marked paid.
                  </p>
                )}
                <Button asChild size="sm" variant="outline" className="w-full">
                  <Link to="/app/earnings">
                    <BriefcaseBusiness className="size-3.5" /> View earnings
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Card className="border-dashed">
            <CardContent className="space-y-2 p-4 text-xs leading-5 text-muted-foreground">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <ShieldCheck className="size-3.5 text-primary" /> Security note
              </p>
              <p>
                PayPal secrets never reach the browser. Only the Sandbox Client ID is exposed when genuine Sandbox
                mode is active, because the PayPal JS SDK requires it.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
