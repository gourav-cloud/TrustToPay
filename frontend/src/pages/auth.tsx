import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, KeyRound, ShieldCheck, UserRound, Wand2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Brand } from "@/components/layout/public-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert } from "@/components/ui/alert";
import { PaymentModeBanner } from "@/components/payment-mode-banner";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80),
  email: z.string().trim().email("Enter a valid email address."),
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .regex(/[A-Za-z]/, "Include a letter.")
    .regex(/[0-9]/, "Include a number."),
  role: z.enum(["REQUESTER", "REVIEWER"]),
});

type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;

export default function AuthPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, login, register, demoLogin } = useAuth();
  const [mode, setMode] = useState<"login" | "register">(params.get("mode") === "register" ? "register" : "login");
  const [error, setError] = useState<string | null>(null);
  const [demoBusy, setDemoBusy] = useState<string | null>(null);

  const status = useQuery({
    queryKey: ["integrations", "status"],
    queryFn: api.integrations.status,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (user) navigate("/app", { replace: true });
  }, [user, navigate]);

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const registerForm = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", role: "REQUESTER" },
  });

  function switchMode(next: "login" | "register") {
    setMode(next);
    setError(null);
    setParams(next === "register" ? { mode: "register" } : {}, { replace: true });
  }

  async function onLogin(values: LoginValues) {
    setError(null);
    try {
      await login(values.email, values.password);
      navigate("/app");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign in failed.");
    }
  }

  async function onRegister(values: RegisterValues) {
    setError(null);
    try {
      await register(values);
      navigate("/app");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed.");
    }
  }

  async function onDemo(role: "requester" | "reviewer" | "admin") {
    setError(null);
    setDemoBusy(role);
    try {
      await demoLogin(role);
      navigate("/app");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Demo login failed.");
    } finally {
      setDemoBusy(null);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      {/* Left panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-slate-950 p-10 text-slate-100 lg:flex">
        <div className="absolute inset-0 surface-grid opacity-[0.07]" aria-hidden />
        <div className="relative">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white">
            <ArrowLeft className="size-4" /> Back to site
          </Link>
          <div className="mt-14 max-w-md">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] text-slate-300">
              <ShieldCheck className="size-3.5" /> PayPal AI Hackathon · sandbox build
            </span>
            <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-tight">
              A verified human answer is cheaper than a confident guess.
            </h1>
            <p className="mt-4 text-sm leading-6 text-slate-400">
              TrustToPay keeps the AI in the loop: it decides when it is uncertain, asks a qualified human,
              checks the evidence independently, and settles the reward through PayPal.
            </p>
            <ul className="mt-8 space-y-4 text-sm text-slate-300">
              {[
                "Deterministic demo AI works with zero credentials",
                "Exclusive, transaction-safe reviewer assignment",
                "Evidence-based verification with a visible checklist",
                "Real PayPal Sandbox Checkout and Payouts adapters",
              ].map((line) => (
                <li key={line} className="flex gap-3">
                  <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                    <ShieldCheck className="size-3" />
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="relative text-[11px] leading-5 text-slate-500">
          Demo access is only enabled while DEMO_MODE=true. This build refuses live PayPal payments.
        </p>
      </div>

      {/* Right panel */}
      <div className="flex flex-col bg-background">
        <div className="flex items-center justify-between px-6 py-5 lg:px-10">
          <Brand />
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground lg:hidden">
            Back to site
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-12 lg:px-10">
          <div className="w-full max-w-md space-y-5">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                {mode === "login" ? "Sign in to TrustToPay" : "Create an account"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {mode === "login"
                  ? "Use a seeded demo account or your own registered account."
                  : "Register as an AI agent operator or a human reviewer."}
              </p>
            </div>

            <Tabs value={mode} onValueChange={(value) => switchMode(value as "login" | "register")}>
              <TabsList className="w-full">
                <TabsTrigger value="login" className="flex-1">
                  Sign in
                </TabsTrigger>
                <TabsTrigger value="register" className="flex-1">
                  Register
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {error ? <Alert tone="danger">{error}</Alert> : null}

            {mode === "login" ? (
              <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4" noValidate>
                <Field label="Email" htmlFor="email" error={loginForm.formState.errors.email?.message}>
                  <Input id="email" type="email" autoComplete="email" {...loginForm.register("email")} />
                </Field>
                <Field label="Password" htmlFor="password" error={loginForm.formState.errors.password?.message}>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    {...loginForm.register("password")}
                  />
                </Field>
                <Button type="submit" className="w-full" loading={loginForm.formState.isSubmitting}>
                  <KeyRound className="size-4" /> Sign in
                </Button>
              </form>
            ) : (
              <form onSubmit={registerForm.handleSubmit(onRegister)} className="space-y-4" noValidate>
                <Field label="Full name" htmlFor="name" error={registerForm.formState.errors.name?.message}>
                  <Input id="name" autoComplete="name" {...registerForm.register("name")} />
                </Field>
                <Field label="Email" htmlFor="reg-email" error={registerForm.formState.errors.email?.message}>
                  <Input id="reg-email" type="email" autoComplete="email" {...registerForm.register("email")} />
                </Field>
                <Field
                  label="Password"
                  htmlFor="reg-password"
                  hint="At least 8 characters with a letter and a number."
                  error={registerForm.formState.errors.password?.message}
                >
                  <Input
                    id="reg-password"
                    type="password"
                    autoComplete="new-password"
                    {...registerForm.register("password")}
                  />
                </Field>
                <Field label="Account type" htmlFor="role" hint="A frontend role selector can never grant admin access.">
                  <select
                    id="role"
                    className="flex h-9 w-full rounded-md border border-input bg-card px-2.5 py-1 text-sm shadow-sm"
                    {...registerForm.register("role")}
                  >
                    <option value="REQUESTER">Requester — I run AI agents</option>
                    <option value="REVIEWER">Reviewer — I verify technical answers</option>
                  </select>
                </Field>
                <Button type="submit" className="w-full" loading={registerForm.formState.isSubmitting}>
                  <UserRound className="size-4" /> Create account
                </Button>
                <p className="text-xs leading-5 text-muted-foreground">
                  New reviewers are approved automatically only in demo mode. In Sandbox mode an administrator
                  must approve reviewer eligibility before tasks can be accepted.
                </p>
              </form>
            )}

            {status.data?.demoUsersEnabled ? (
              <Card className="border-dashed">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <Wand2 className="size-4 text-primary" /> Demo access (evaluation only)
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    One click signs you in as a seeded user. Only available while <code>DEMO_MODE=true</code>.
                    All seeded payments are simulated.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      loading={demoBusy === "requester"}
                      onClick={() => onDemo("requester")}
                    >
                      Requester
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      loading={demoBusy === "reviewer"}
                      onClick={() => onDemo("reviewer")}
                    >
                      Reviewer
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      loading={demoBusy === "admin"}
                      onClick={() => onDemo("admin")}
                    >
                      Admin
                    </Button>
                  </div>
                  <div className="rounded-md bg-muted/60 p-2.5 font-mono text-[11px] leading-5 text-muted-foreground">
                    agent@demo.trusttopay.dev
                    <br />
                    reviewer@demo.trusttopay.dev
                    <br />
                    admin@demo.trusttopay.dev
                    <br />
                    password: Demo1234!
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <PaymentModeBanner compact />

            <p className="text-center text-xs text-muted-foreground">
              <Link to="/app/docs" className="inline-flex items-center gap-1 hover:text-foreground">
                Setup and sandbox guide <ArrowRight className="size-3" />
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
