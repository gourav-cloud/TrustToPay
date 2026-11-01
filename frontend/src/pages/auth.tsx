import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  Code2,
  KeyRound,
  Lock,
  ShieldCheck,
  Terminal,
  UserRound,
} from "lucide-react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Brand } from "@/components/layout/public-layout";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { PaymentModeBanner } from "@/components/payment-mode-banner";
import { cn } from "@/lib/utils";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(80),
  email: z.string().trim().email("Enter a valid email address."),
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .regex(/[A-Za-z]/, "Include at least one letter.")
    .regex(/[0-9]/, "Include at least one number."),
  role: z.enum(["REQUESTER", "REVIEWER"]),
});

type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;

export default function AuthPage({ initialMode }: { initialMode?: "login" | "register" }) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, login, register } = useAuth();

  const derivedMode: "login" | "register" =
    initialMode === "register" || location.pathname === "/register" || params.get("mode") === "register"
      ? "register"
      : "login";

  const [mode, setMode] = useState<"login" | "register">(derivedMode);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMode(derivedMode);
  }, [derivedMode]);

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

  const selectedRole = registerForm.watch("role");

  function switchMode(next: "login" | "register") {
    setMode(next);
    setError(null);
    if (location.pathname === "/register" && next === "login") {
      navigate("/login", { replace: true });
      return;
    }
    if (location.pathname === "/login" && next === "register") {
      setParams({ mode: "register" }, { replace: true });
      return;
    }
    setParams(next === "register" ? { mode: "register" } : {}, { replace: true });
  }

  async function onLogin(values: LoginValues) {
    setError(null);
    try {
      await login(values.email, values.password);
      navigate("/app", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign in failed. Check your email and password.");
    }
  }

  async function onRegister(values: RegisterValues) {
    setError(null);
    try {
      await register(values);
      navigate("/app", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed. Please verify your details.");
    }
  }

  return (
    <div className="grid min-h-dvh bg-[#080C14] text-[#F1F5F9] lg:grid-cols-[1.04fr_1fr]">
      {/* Left architectural panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-[#1E2B42] bg-[#0B101B] p-10 lg:flex xl:p-14">
        <div className="surface-grid-dark pointer-events-none absolute inset-0 opacity-60" aria-hidden />
        <div
          className="pointer-events-none absolute -left-24 top-16 h-80 w-80 rounded-full bg-[#3B82F6]/10 blur-3xl"
          aria-hidden
        />

        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <Brand tone="inverse" />
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#94A3B8] transition-colors hover:text-[#F1F5F9]"
            >
              <ArrowLeft className="size-3.5" /> Back to home
            </Link>
          </div>

          <div className="mt-14 max-w-lg">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#3B82F6]">
              Human-in-the-Loop Execution Protocol
            </p>
            <h1 className="mt-3 font-display text-3xl font-bold leading-[1.15] tracking-tight text-[#F1F5F9] xl:text-4xl">
              Deterministic verification between autonomous agents and human specialists.
            </h1>
            <p className="mt-4 text-sm leading-6 text-[#94A3B8]">
              When an AI agent hits conflicting specifications, ambiguous runtime behavior, or high-risk code paths,
              TrustToPay routes the bounded blocker to a verified specialist, validates the submission in isolation, and
              returns a signed handback payload.
            </p>

            <div className="mt-8 space-y-3 border-t border-[#1E2B42] pt-6">
              {[
                {
                  title: "Hybrid Specialist Discovery",
                  detail:
                    "Elastic semantic + keyword retrieval paired with strict PostgreSQL revalidation of L1–L3 skill levels and capacity.",
                },
                {
                  title: "Layered Security & Verification Gate",
                  detail:
                    "Canonical SHA-256 artifact digests inspected by deterministic secret scanners, Gemini security review, and an isolated runner.",
                },
                {
                  title: "Decoupled PayPal Escrow & Signed Handback",
                  detail:
                    "Orders v2 funding capture before dispatch, independent verification before Payouts v1 release, and HMAC-SHA256 agent resumption.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-lg border border-[#1E2B42] bg-[#0E1522]/90 p-3.5 transition-colors hover:border-[#2A3B59]"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border border-[#10B981]/30 bg-[#10B981]/10 text-[#10B981]">
                      <ShieldCheck className="size-3.5" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-[#F1F5F9]">{item.title}</p>
                      <p className="mt-1 text-xs leading-5 text-[#94A3B8]">{item.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between border-t border-[#1E2B42] pt-5 font-mono text-[11px] text-[#64748B]">
          <span>SHA-256 Artifact Integrity · HMAC-SHA256 Handback</span>
          <span>PayPal Sandbox Guardrails Active</span>
        </div>
      </div>

      {/* Right authentication panel */}
      <div className="flex flex-col justify-between bg-[#080C14]">
        <div className="flex items-center justify-between border-b border-[#1E2B42] px-6 py-4 lg:border-b-0 lg:px-10 lg:py-6">
          <div className="lg:hidden">
            <Brand />
          </div>
          <div className="hidden text-xs text-[#64748B] lg:block">
            {mode === "login" ? "New to TrustToPay?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => switchMode(mode === "login" ? "register" : "login")}
              className="font-medium text-[#3B82F6] hover:text-[#60A5FA]"
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </div>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#94A3B8] hover:text-[#F1F5F9] lg:hidden"
          >
            <ArrowLeft className="size-3.5" /> Home
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-8 lg:px-12">
          <div className="w-full max-w-md space-y-6">
            <div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-[#3B82F6]">
                {mode === "login" ? "Workspace Access" : "Account Provisioning"}
              </p>
              <h2 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-[#F1F5F9]">
                {mode === "login" ? "Sign in to TrustToPay" : "Create your TrustToPay account"}
              </h2>
              <p className="mt-1.5 text-sm leading-6 text-[#94A3B8]">
                {mode === "login"
                  ? "Access your agent sessions, specialist workbench, verification logs, and payment ledger."
                  : "Choose your workspace role to start escalating agent blockers or verifying technical tasks."}
              </p>
            </div>

            {/* Clean segmented mode switcher */}
            <div
              role="tablist"
              aria-label="Authentication mode"
              className="grid grid-cols-2 rounded-lg border border-[#1E2B42] bg-[#0E1522] p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === "login"}
                onClick={() => switchMode("login")}
                className={cn(
                  "rounded-md py-2 text-xs font-semibold transition-colors",
                  mode === "login"
                    ? "bg-[#151E2E] text-[#F1F5F9] shadow-sm"
                    : "text-[#94A3B8] hover:text-[#F1F5F9]",
                )}
              >
                Sign In
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "register"}
                onClick={() => switchMode("register")}
                className={cn(
                  "rounded-md py-2 text-xs font-semibold transition-colors",
                  mode === "register"
                    ? "bg-[#151E2E] text-[#F1F5F9] shadow-sm"
                    : "text-[#94A3B8] hover:text-[#F1F5F9]",
                )}
              >
                Create Account
              </button>
            </div>

            {error ? <Alert tone="danger">{error}</Alert> : null}

            <div className="rounded-xl border border-[#1E2B42] bg-[#0E1522] p-6 shadow-xl">
              {mode === "login" ? (
                <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4" noValidate>
                  <Field label="Work or personal email" htmlFor="email" error={loginForm.formState.errors.email?.message}>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@company.com"
                      autoComplete="email"
                      {...loginForm.register("email")}
                    />
                  </Field>
                  <Field label="Password" htmlFor="password" error={loginForm.formState.errors.password?.message}>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      autoComplete="current-password"
                      {...loginForm.register("password")}
                    />
                  </Field>
                  <Button type="submit" className="w-full" loading={loginForm.formState.isSubmitting}>
                    <KeyRound className="size-4" /> Sign in to workspace
                  </Button>
                </form>
              ) : (
                <form onSubmit={registerForm.handleSubmit(onRegister)} className="space-y-4" noValidate>
                  <Field label="Full name" htmlFor="name" error={registerForm.formState.errors.name?.message}>
                    <Input
                      id="name"
                      placeholder="Ada Lovelace"
                      autoComplete="name"
                      {...registerForm.register("name")}
                    />
                  </Field>
                  <Field label="Email address" htmlFor="reg-email" error={registerForm.formState.errors.email?.message}>
                    <Input
                      id="reg-email"
                      type="email"
                      placeholder="ada@engineering.org"
                      autoComplete="email"
                      {...registerForm.register("email")}
                    />
                  </Field>
                  <Field
                    label="Password"
                    htmlFor="reg-password"
                    hint="Minimum 8 characters with at least one letter and one number."
                    error={registerForm.formState.errors.password?.message}
                  >
                    <Input
                      id="reg-password"
                      type="password"
                      placeholder="Create a strong password"
                      autoComplete="new-password"
                      {...registerForm.register("password")}
                    />
                  </Field>

                  <div className="space-y-2">
                    <label htmlFor="role" className="text-sm font-medium leading-none text-[#F1F5F9]">
                      Workspace role
                    </label>
                    <input type="hidden" id="role" {...registerForm.register("role")} />
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => registerForm.setValue("role", "REQUESTER", { shouldValidate: true })}
                        className={cn(
                          "flex flex-col items-start rounded-lg border p-3 text-left transition-colors",
                          selectedRole === "REQUESTER"
                            ? "border-[#3B82F6] bg-[#3B82F6]/10 text-[#F1F5F9]"
                            : "border-[#1E2B42] bg-[#080C14] text-[#94A3B8] hover:border-[#2A3B59] hover:text-[#F1F5F9]",
                        )}
                      >
                        <div className="flex w-full items-center justify-between">
                          <Bot className="size-4 text-[#3B82F6]" />
                          {selectedRole === "REQUESTER" ? (
                            <CheckCircle2 className="size-3.5 text-[#3B82F6]" />
                          ) : null}
                        </div>
                        <span className="mt-2 text-xs font-semibold text-[#F1F5F9]">Requester</span>
                        <span className="mt-0.5 text-[11px] leading-4 text-[#94A3B8]">
                          I run AI agents &amp; fund human escalations
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => registerForm.setValue("role", "REVIEWER", { shouldValidate: true })}
                        className={cn(
                          "flex flex-col items-start rounded-lg border p-3 text-left transition-colors",
                          selectedRole === "REVIEWER"
                            ? "border-[#3B82F6] bg-[#3B82F6]/10 text-[#F1F5F9]"
                            : "border-[#1E2B42] bg-[#080C14] text-[#94A3B8] hover:border-[#2A3B59] hover:text-[#F1F5F9]",
                        )}
                      >
                        <div className="flex w-full items-center justify-between">
                          <Code2 className="size-4 text-[#10B981]" />
                          {selectedRole === "REVIEWER" ? (
                            <CheckCircle2 className="size-3.5 text-[#3B82F6]" />
                          ) : null}
                        </div>
                        <span className="mt-2 text-xs font-semibold text-[#F1F5F9]">Specialist</span>
                        <span className="mt-0.5 text-[11px] leading-4 text-[#94A3B8]">
                          I verify tasks, submit patches &amp; earn rewards
                        </span>
                      </button>
                    </div>
                  </div>

                  <Button type="submit" className="w-full" loading={registerForm.formState.isSubmitting}>
                    <UserRound className="size-4" /> Create account
                  </Button>
                </form>
              )}
            </div>

            <PaymentModeBanner compact />

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1E2B42] pt-4 text-xs text-[#64748B]">
              <span className="inline-flex items-center gap-1.5">
                <Lock className="size-3.5 text-[#10B981]" /> Session JWT &amp; httpOnly cookie security
              </span>
              <Link to="/app/docs" className="inline-flex items-center gap-1 text-[#94A3B8] hover:text-[#F1F5F9]">
                <Terminal className="size-3.5" /> Architecture &amp; setup docs <ArrowRight className="size-3" />
              </Link>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 text-center text-[11px] text-[#64748B] lg:px-10">
          By signing in or creating an account, you acknowledge the{" "}
          <Link to="/privacy" className="text-[#94A3B8] underline underline-offset-2 hover:text-[#F1F5F9]">
            Data Governance Notice
          </Link>
          .
        </div>
      </div>
    </div>
  );
}
