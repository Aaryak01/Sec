import type { Metadata } from "next";
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
      <ChatInterface />
    </main>
  );
}
