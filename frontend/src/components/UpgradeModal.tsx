"use client";

import { useState } from "react";
import { createCheckoutSession } from "@/lib/chat-api";

const PRO_BENEFITS = [
  "Unlimited messages, every day",
  "No daily reset to wait on",
  "Same real filing data and charts",
];

export default function UpgradeModal({
  open,
  onClose,
  accessToken,
}: {
  open: boolean;
  onClose: () => void;
  accessToken: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubscribe() {
    if (!accessToken) return;
    setError(null);
    setLoading(true);
    try {
      const { checkout_url } = await createCheckoutSession(accessToken);
      // Full-page redirect to Stripe's own hosted Checkout page — not an
      // API call we render ourselves. The user comes back to /chat via
      // success_url once they've paid (or cancel_url if they back out).
      window.location.href = checkout_url;
    } catch {
      setError("Couldn't start checkout. Please try again in a moment.");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="Close upgrade dialog"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/20"
      />
      <div className="relative w-full max-w-sm rounded-[20px] border border-card-border bg-card p-6 shadow-[0_2px_8px_rgba(33,33,69,0.06),0_16px_40px_rgba(33,33,69,0.10)] sm:p-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>

        <h2 className="mb-1 text-lg font-semibold text-foreground">Upgrade to Pro</h2>
        <p className="mb-5 text-sm text-muted-foreground">
          Free accounts get 10 messages a day. Pro removes the limit entirely.
        </p>

        <ul className="mb-6 space-y-2">
          {PRO_BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2 text-sm text-foreground">
              <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 10l4 4 8-8" />
              </svg>
              {benefit}
            </li>
          ))}
        </ul>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={handleSubscribe}
          disabled={loading || !accessToken}
          className="w-full cursor-pointer rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-all duration-200 hover:-translate-y-px hover:bg-accent-hover hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          {loading ? "Redirecting to checkout…" : "Subscribe"}
        </button>

        {/* This is the "small, tasteful note" this feature is required to
            carry — deliberately placed right where a real payment button
            would be, not buried, since that's exactly where it matters. */}
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Demo project — this uses{" "}
          <span className="font-medium">Stripe test mode</span>. No real
          payment is made. Use test card{" "}
          <code className="rounded bg-foreground/5 px-1 py-0.5 font-mono">
            4242 4242 4242 4242
          </code>
          , any future expiry, any CVC.
        </p>
      </div>
    </div>
  );
}
