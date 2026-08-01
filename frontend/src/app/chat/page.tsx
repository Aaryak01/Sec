import type { Metadata } from "next";
import { Suspense } from "react";
import ChatInterface from "@/components/ChatInterface";

export const metadata: Metadata = {
  title: "Chat — SEC Filing Analyst",
  description: "Ask questions about real SEC filings in plain English.",
};

// No SiteHeader here on purpose — a real Claude/ChatGPT-style layout doesn't
// stack a full-width masthead above the sidebar; the sidebar's own top
// section carries the branding and the back-to-home link instead.
export default function ChatPage() {
  return (
    <main className="h-dvh">
      {/* ChatInterface reads useSearchParams() (to detect the ?upgrade=...
          redirect back from Stripe Checkout) — the App Router requires a
          Suspense boundary around any component that does, or the build
          fails. Fallback is deliberately identical to ChatInterface's own
          auth-pending state so there's no visible flash between them. */}
      <Suspense
        fallback={
          <div className="flex h-dvh w-full items-center justify-center">
            <p className="text-sm text-muted-foreground">Loading…</p>
          </div>
        }
      >
        <ChatInterface />
      </Suspense>
    </main>
  );
}
