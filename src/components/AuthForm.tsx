"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import {
  confirmSignUp,
  getCurrentUser,
  resendSignUpCode,
  signOut,
  signUp,
} from "aws-amplify/auth";
import { describeAuthError } from "@/lib/auth-errors";
import { signInWithRecovery, StaleSessionRecoveryError } from "@/lib/auth-recovery";

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
  // Set only when automatic stale-session recovery itself failed (see
  // auth-recovery.ts) — shows a manual fallback instead of the generic
  // error text, since a normal user otherwise has no way to act on
  // "there's already a signed in user" themselves.
  const [staleSessionStuck, setStaleSessionStuck] = useState(false);
  // null = still checking, so this landing page's auth form never flashes
  // before a redirect for a visitor who's already signed in — this is the
  // actual root cause of most "already signed in" errors: a returning,
  // still-authenticated user landing on "/" and seeing (and submitting) a
  // sign-in form the app never needed to show them at all. Mirrors
  // ChatInterface's own auth check, just redirecting the opposite way.
  const [checkingExistingSession, setCheckingExistingSession] = useState(true);
  const emailId = useId();
  const passwordId = useId();
  const codeId = useId();

  useEffect(() => {
    let cancelled = false;
    getCurrentUser()
      .then(() => {
        if (!cancelled) router.replace("/chat");
      })
      .catch(() => {
        if (!cancelled) setCheckingExistingSession(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleStaleSessionSignOut() {
    setError(null);
    setStaleSessionStuck(false);
    setLoading(true);
    try {
      await signOut();
    } catch {
      // Best-effort — even if the network call to revoke tokens failed,
      // Amplify's local sign-out step still runs first and clears the
      // cached session that was actually blocking sign-in, so retrying
      // below is still worth doing.
    } finally {
      setLoading(false);
    }
  }

  const isSignup = mode === "signup";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setStaleSessionStuck(false);
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
          // Goes through signInWithRecovery too: a brand-new account can't
          // itself be the stale session, but the *browser* could still
          // have an unrelated leftover one cached from earlier.
          await signInWithRecovery(email, password);
          router.push("/chat");
        }
      } else {
        const result = await signInWithRecovery(email, password);
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
      if (err instanceof StaleSessionRecoveryError) {
        setStaleSessionStuck(true);
      } else {
        setError(describeAuthError(err));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setStaleSessionStuck(false);
    setLoading(true);
    try {
      await confirmSignUp({
        username: pendingUsername ?? email,
        confirmationCode,
      });
      // The password is still in state from the form step, so we can sign
      // the user straight in rather than sending them back to re-enter it.
      const result = await signInWithRecovery(email, password);
      if (result.isSignedIn) {
        router.push("/chat");
      } else {
        setError("Verified — please sign in.");
        setStep("form");
        setMode("signin");
      }
    } catch (err) {
      if (err instanceof StaleSessionRecoveryError) {
        setStaleSessionStuck(true);
      } else {
        setError(describeAuthError(err));
      }
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

  if (checkingExistingSession) {
    // Same footprint as the real card below so nothing jumps once this
    // resolves — for a genuinely anonymous visitor (the common case) this
    // never renders long enough to notice, since getCurrentUser() fails
    // near-instantly with no cached tokens to check at all.
    return (
      <div
        id="auth"
        className="w-full max-w-sm rounded-[20px] border border-card-border bg-card p-6 shadow-[0_2px_8px_rgba(33,33,69,0.06),0_12px_32px_rgba(33,33,69,0.08)] sm:p-8"
      >
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
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

          {staleSessionStuck && (
            <div className="rounded-lg border border-card-border bg-background p-3">
              <p className="mb-2 text-sm text-foreground">
                You&apos;re already signed in on this browser, and we
                couldn&apos;t clear that session automatically.
              </p>
              <button
                type="button"
                onClick={handleStaleSessionSignOut}
                className="cursor-pointer text-sm font-medium text-accent hover:underline"
              >
                Sign out and continue
              </button>
            </div>
          )}
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

        {staleSessionStuck && (
          <div className="rounded-lg border border-card-border bg-background p-3">
            <p className="mb-2 text-sm text-foreground">
              You&apos;re already signed in on this browser, and we
              couldn&apos;t clear that session automatically.
            </p>
            <button
              type="button"
              onClick={handleStaleSessionSignOut}
              className="cursor-pointer text-sm font-medium text-accent hover:underline"
            >
              Sign out and continue
            </button>
          </div>
        )}
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
