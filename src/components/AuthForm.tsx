"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import {
  confirmSignUp,
  resendSignUpCode,
  signIn,
  signUp,
} from "aws-amplify/auth";
import { describeAuthError } from "@/lib/auth-errors";

type Mode = "signin" | "signup";
type Step = "form" | "verify";

export default function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signup");
  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmationCode, setConfirmationCode] = useState("");
  // This pool has AliasAttributes (email as a lookup alias) rather than
  // UsernameAttributes=[email] — Cognito rejects an email-shaped value as
  // the literal Username at signUp ("Username cannot be of email format,
  // since user pool is configured for email alias"), even though email
  // works fine as the identifier for signIn/resendSignUpCode afterward via
  // alias resolution. So sign-up gets its own opaque username, carried
  // through confirmSignUp in the same flow; sign-in keeps using email.
  const [pendingUsername, setPendingUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const emailId = useId();
  const passwordId = useId();
  const codeId = useId();

  const isSignup = mode === "signup";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isSignup) {
        const newUsername = crypto.randomUUID();
        const result = await signUp({
          username: newUsername,
          password,
          options: { userAttributes: { email } },
        });
        if (result.nextStep.signUpStep === "CONFIRM_SIGN_UP") {
          setPendingUsername(newUsername);
          setStep("verify");
        } else {
          // Pool has no confirmation step configured — sign straight in.
          await signIn({ username: email, password });
          router.push("/chat");
        }
      } else {
        const result = await signIn({ username: email, password });
        if (result.isSignedIn) {
          router.push("/chat");
        } else if (result.nextStep.signInStep === "CONFIRM_SIGN_UP") {
          // Account exists but was never verified — the code from sign-up
          // may be long gone, so send a fresh one before showing that step.
          // No opaque username from this session to fall back on, so this
          // relies on email resolving via the pool's alias — unlike signUp,
          // signIn/resendSignUpCode are identifier-lookup operations, which
          // is exactly what aliases are documented to support.
          setPendingUsername(null);
          await resendSignUpCode({ username: email });
          setStep("verify");
        } else {
          setError(
            `This account requires an extra step (${result.nextStep.signInStep}) that isn't supported here yet.`,
          );
        }
      }
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await confirmSignUp({
        username: pendingUsername ?? email,
        confirmationCode,
      });
      // The password is still in state from the form step, so we can sign
      // the user straight in rather than sending them back to re-enter it.
      const result = await signIn({ username: email, password });
      if (result.isSignedIn) {
        router.push("/chat");
      } else {
        setError("Verified — please sign in.");
        setStep("form");
        setMode("signin");
      }
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError(null);
    setResendMessage(null);
    try {
      await resendSignUpCode({ username: pendingUsername ?? email });
      setResendMessage("A new code is on its way.");
    } catch (err) {
      setError(describeAuthError(err));
    }
  }

  if (step === "verify") {
    return (
      <div
        id="auth"
        className="w-full max-w-sm rounded-[20px] border border-card-border bg-card p-6 shadow-[0_2px_8px_rgba(33,33,69,0.06),0_12px_32px_rgba(33,33,69,0.08)] sm:p-8"
      >
        <h2 className="mb-1 text-lg font-semibold text-foreground">
          Verify your email
        </h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Enter the code we sent to {email}.
        </p>

        <form onSubmit={handleVerify} className="space-y-4" noValidate>
          <div>
            <label
              htmlFor={codeId}
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Verification code
            </label>
            <input
              id={codeId}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={confirmationCode}
              onChange={(e) => setConfirmationCode(e.target.value)}
              placeholder="123456"
              className="w-full rounded-lg border border-card-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {resendMessage && !error && (
            <p className="text-sm text-muted-foreground">{resendMessage}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full cursor-pointer rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-all duration-200 hover:-translate-y-px hover:bg-accent-hover hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
          >
            {loading ? "Verifying…" : "Verify"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          Didn&apos;t get a code?{" "}
          <button
            type="button"
            onClick={handleResend}
            className="cursor-pointer font-medium text-accent hover:underline"
          >
            Resend
          </button>
        </p>
      </div>
    );
  }

  return (
    <div
      id="auth"
      className="w-full max-w-sm rounded-[20px] border border-card-border bg-card p-6 shadow-[0_2px_8px_rgba(33,33,69,0.06),0_12px_32px_rgba(33,33,69,0.08)] sm:p-8"
    >
      <div className="mb-6 grid grid-cols-2 rounded-lg bg-foreground/5 p-1">
        <button
          type="button"
          onClick={() => {
            setMode("signup");
            setError(null);
          }}
          aria-pressed={isSignup}
          className={`cursor-pointer rounded-md py-2 text-sm font-medium transition-colors ${
            isSignup
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Sign up
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("signin");
            setError(null);
          }}
          aria-pressed={!isSignup}
          className={`cursor-pointer rounded-md py-2 text-sm font-medium transition-colors ${
            !isSignup
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Sign in
        </button>
      </div>

      <h2 className="mb-1 text-lg font-semibold text-foreground">
        {isSignup ? "Create your account" : "Welcome back"}
      </h2>
      <p className="mb-6 text-sm text-muted-foreground">
        {isSignup
          ? "Start asking questions about real SEC filings."
          : "Sign in to pick up where you left off."}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label
            htmlFor={emailId}
            className="mb-1.5 block text-sm font-medium text-foreground"
          >
            Email
          </label>
          <input
            id={emailId}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-card-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
        </div>

        <div>
          <label
            htmlFor={passwordId}
            className="mb-1.5 block text-sm font-medium text-foreground"
          >
            Password
          </label>
          <input
            id={passwordId}
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-lg border border-card-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
          {isSignup && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              At least 8 characters, with uppercase, lowercase, a number, and
              a symbol.
            </p>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full cursor-pointer rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-all duration-200 hover:-translate-y-px hover:bg-accent-hover hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          {loading
            ? isSignup
              ? "Creating account…"
              : "Signing in…"
            : isSignup
              ? "Create account"
              : "Sign in"}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        {isSignup ? "Already have an account? " : "Don't have an account? "}
        <button
          type="button"
          onClick={() => {
            setMode(isSignup ? "signin" : "signup");
            setError(null);
          }}
          className="cursor-pointer font-medium text-accent hover:underline"
        >
          {isSignup ? "Sign in" : "Sign up"}
        </button>
      </p>
    </div>
  );
}
