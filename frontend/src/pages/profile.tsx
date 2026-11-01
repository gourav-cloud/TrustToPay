import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  BriefcaseBusiness,
  CheckCircle2,
  Lock,
  Mail,
  Play,
  Save,
  ShieldCheck,
  UserRound,
  Wallet,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { SkillAssessmentAttemptResult, SkillAssessmentQuestion } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, SectionHeading, DataRow } from "@/components/common";
import { PaymentModeBanner } from "@/components/payment-mode-banner";
import { SkillLevelBadge } from "@/components/status-badges";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { LoadingBlock } from "@/components/ui/states";
import { formatDate, humanize } from "@/lib/format";

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

  // Active sequential assessment state
  const [activeAttempt, setActiveAttempt] = useState<{
    id: string;
    skillName: string;
    level: number;
    levelName: string;
    passingScore: number;
    questions: SkillAssessmentQuestion[];
  } | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [assessmentResult, setAssessmentResult] = useState<SkillAssessmentAttemptResult | null>(null);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setHeadline(user.profile?.headline ?? "");
    setBio(user.profile?.bio ?? "");
    setPayoutEmail(user.profile?.payoutEmail ?? "");
    setConsent(user.profile?.payoutConsent ?? false);
    setTimezone(user.profile?.timezone ?? "UTC");
  }, [user]);

  const reviewerDashboard = useQuery({
    queryKey: ["dashboard", "reviewer"],
    queryFn: api.dashboards.reviewer,
    enabled: user?.role === "REVIEWER" || user?.role === "ADMIN",
  });

  const skillsCatalog = useQuery({
    queryKey: ["skills", "catalog"],
    queryFn: api.skills.list,
    enabled: Boolean(user),
  });

  const startAssessment = useMutation({
    mutationFn: ({ skillId, level }: { skillId: string; level: number }) =>
      api.skills.startAssessment(skillId, level),
    onSuccess: (data) => {
      setAssessmentError(null);
      setAssessmentResult(null);
      const initialAnswers: Record<string, string> = {};
      for (const q of data.questions) {
        if (q.type === "CODE_TASK" && q.starterCode) {
          initialAnswers[q.id] = q.starterCode;
        }
      }
      setAnswers(initialAnswers);
      setActiveAttempt({
        id: data.attempt.id,
        skillName: data.attempt.skillName,
        level: data.attempt.level,
        levelName: data.attempt.levelName,
        passingScore: data.attempt.passingScore,
        questions: data.questions,
      });
    },
    onError: (err) => {
      setAssessmentError(err instanceof ApiError ? err.message : "Could not start skill assessment.");
    },
  });

  const submitAssessment = useMutation({
    mutationFn: () => {
      if (!activeAttempt) throw new Error("No active assessment");
      return api.skills.submitAttempt(activeAttempt.id, answers);
    },
    onSuccess: async (data) => {
      setAssessmentError(null);
      setAssessmentResult(data.attempt);
      setActiveAttempt(null);
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["skills"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => {
      setAssessmentError(err instanceof ApiError ? err.message : "Could not submit skill assessment.");
    },
  });

  const save = useMutation({
    mutationFn: () =>
      api.users.updatePayout({
        headline: headline.trim() || null,
        bio: bio.trim() || null,
        payoutEmail: payoutEmail.trim() || null,
        payoutConsent: consent,
        timezone: timezone.trim() || "UTC",
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
  const verifiedSkills = user.skills ?? [];

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
            ? "Verified skills are earned sequentially (L1 Foundation → L2 Practitioner → L3 Advanced). A PayPal email and explicit consent are required before a verified reward can be paid."
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
                <div className="space-y-3 pt-1">
                  <SectionHeading
                    title="Verified reviewer skills"
                    description="Skills cannot be self-reported. Badges are granted only by passing sequential L1 → L2 → L3 technical assessments."
                  />
                  {verifiedSkills.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                      No verified skills yet. Pass a Level 1 (Foundation) assessment below to earn your first verified skill badge.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {verifiedSkills.map((skill) => (
                        <SkillLevelBadge key={skill.id} name={skill.name} level={skill.level} />
                      ))}
                    </div>
                  )}

                  {assessmentError ? <Alert tone="danger">{assessmentError}</Alert> : null}
                  {assessmentResult ? (
                    <Alert tone={assessmentResult.passed ? "success" : "warning"}>
                      <div className="space-y-1">
                        <p className="font-semibold">
                          {assessmentResult.skillName} · L{assessmentResult.level} ({assessmentResult.levelName}) —{" "}
                          {assessmentResult.passed ? "PASSED" : "FAILED"} ({assessmentResult.score}% /{" "}
                          {assessmentResult.passingScore}% required)
                        </p>
                        {assessmentResult.cooldownUntil ? (
                          <p className="text-xs">
                            Retake cooldown active until {formatDate(assessmentResult.cooldownUntil)}. Previously passed levels remain active.
                          </p>
                        ) : null}
                      </div>
                    </Alert>
                  ) : null}

                  {activeAttempt ? (
                    <div className="space-y-3 rounded-lg border border-primary/30 bg-muted/20 p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-foreground">
                            {activeAttempt.skillName} — Level {activeAttempt.level} ({activeAttempt.levelName})
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Passing score: {activeAttempt.passingScore}%
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setActiveAttempt(null)}
                        >
                          Cancel
                        </Button>
                      </div>

                      {activeAttempt.questions.map((q, idx) => (
                        <div key={q.id} className="space-y-2 rounded-md border border-border bg-background p-3">
                          <p className="text-xs font-medium text-foreground">
                            {idx + 1}. {q.prompt}
                          </p>
                          {q.type === "MULTIPLE_CHOICE" && q.options ? (
                            <div className="space-y-1.5">
                              {q.options.map((opt) => (
                                <label
                                  key={opt.id}
                                  className="flex cursor-pointer items-start gap-2 rounded border border-border/70 p-2 text-xs hover:bg-muted/40"
                                >
                                  <input
                                    type="radio"
                                    name={q.id}
                                    value={opt.id}
                                    checked={answers[q.id] === opt.id}
                                    onChange={() =>
                                      setAnswers((prev) => ({
                                        ...prev,
                                        [q.id]: opt.id,
                                      }))
                                    }
                                    className="mt-0.5 accent-primary"
                                  />
                                  <span>{opt.text}</span>
                                </label>
                              ))}
                            </div>
                          ) : (
                            <Textarea
                              rows={4}
                              className="font-mono text-xs"
                              value={answers[q.id] ?? ""}
                              onChange={(e) =>
                                setAnswers((prev) => ({
                                  ...prev,
                                  [q.id]: e.target.value,
                                }))
                              }
                            />
                          )}
                        </div>
                      ))}

                      <div className="flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          loading={submitAssessment.isPending}
                          onClick={() => submitAssessment.mutate()}
                        >
                          Submit assessment
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {skillsCatalog.data?.skills ? (
                    <div className="space-y-2 pt-1">
                      <p className="text-xs font-semibold text-foreground">
                        Sequential Skill Verification Tracks (L1 → L2 → L3)
                      </p>
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        {skillsCatalog.data.skills.map((skill) => (
                          <div
                            key={skill.id}
                            className="flex flex-col justify-between gap-2 rounded-md border border-border p-3 text-xs"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-foreground">{skill.name}</span>
                                {skill.verifiedLevel > 0 ? (
                                  <SkillLevelBadge level={skill.verifiedLevel} />
                                ) : (
                                  <Badge tone="neutral">Unverified</Badge>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground">{skill.description}</p>
                            </div>
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {skill.stages.map((stage) => {
                                const canStart = stage.status === "AVAILABLE";
                                return (
                                  <Button
                                    key={stage.id}
                                    type="button"
                                    size="sm"
                                    variant={stage.passed ? "secondary" : canStart ? "outline" : "ghost"}
                                    disabled={!canStart || startAssessment.isPending}
                                    onClick={() =>
                                      startAssessment.mutate({ skillId: skill.slug, level: stage.level })
                                    }
                                    className="h-7 px-2 text-[11px]"
                                  >
                                    {stage.passed ? (
                                      <CheckCircle2 className="size-3 text-emerald-600" />
                                    ) : canStart ? (
                                      <Play className="size-3 text-primary" />
                                    ) : (
                                      <Lock className="size-3 text-muted-foreground" />
                                    )}
                                    L{stage.level} {stage.levelName}
                                  </Button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
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
            <Card className={ready ? "border-emerald-500/30" : "border-amber-500/30"}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  {ready ? (
                    <BadgeCheck className="size-4 text-emerald-400" />
                  ) : (
                    <Mail className="size-4 text-amber-400" />
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
