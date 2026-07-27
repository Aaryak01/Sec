"use client";

import { useId, useState } from "react";

type Mode = "signin" | "signup";

export default function AuthForm() {
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const emailId = useId();
  const passwordId = useId();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // No backend yet — real auth (and the redirect into the app) gets wired
    // up here later. Left as a no-op rather than a fake success state so the
    // UI doesn't imply anything happened.
  }

  const isSignup = mode === "signup";

  return (
    <div
      id="auth"
      className="w-full max-w-sm rounded-[20px] border border-card-border bg-card p-6 shadow-[0_2px_8px_rgba(33,33,69,0.06),0_12px_32px_rgba(33,33,69,0.08)] sm:p-8"
    >
      <div className="mb-6 grid grid-cols-2 rounded-lg bg-foreground/5 p-1">
        <button
          type="button"
          onClick={() => setMode("signup")}
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
          onClick={() => setMode("signin")}
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
        </div>

        <button
          type="submit"
          className="w-full cursor-pointer rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-all duration-200 hover:-translate-y-px hover:bg-accent-hover hover:shadow-md"
        >
          {isSignup ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        {isSignup ? "Already have an account? " : "Don't have an account? "}
        <button
          type="button"
          onClick={() => setMode(isSignup ? "signin" : "signup")}
          className="cursor-pointer font-medium text-accent hover:underline"
        >
          {isSignup ? "Sign in" : "Sign up"}
        </button>
      </p>
    </div>
  );
}
