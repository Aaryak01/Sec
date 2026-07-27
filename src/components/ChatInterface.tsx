"use client";

import { useState } from "react";
import ChatMessage from "./ChatMessage";
import ChatSidebar from "./ChatSidebar";
import RevenueChart from "./RevenueChart";

type Message = { question: string; answer: string; source?: string; chart?: boolean };
type Conversation = { id: string; title: string; messages: Message[] };

// Same representative response patterns established for the hero demo —
// metric lookup, filing search with a citation, chart-backed trend — reused
// here so an example chip and a saved conversation both show something the
// real product would actually say, not an idealized mockup.
const EXAMPLE_QUESTIONS: Message[] = [
  {
    question: "What was Apple's revenue in FY 2025?",
    answer:
      "Apple reported $416.2B in revenue for FY 2025, up 6.4% from FY 2024.",
    source: "Apple, 10-K — Financial Statements",
  },
  {
    question: "What are Nvidia's biggest supply chain risks?",
    answer:
      "Nvidia's filings cite chip fabrication capacity as a primary supply chain concern, mentioned across multiple recent quarters.",
    source: "Nvidia, 10-K — Item 1A",
  },
  {
    question: "Show me Tesla's revenue trend.",
    answer:
      "Tesla's revenue peaked in FY 2024 before pulling back through FY 2025. A spike followed by a pullback can mean a one-time boost — a big deal, a demand surge — that didn't repeat, rather than an ongoing decline.",
    chart: true,
  },
];

// No backend wired up yet, same as the sign-up form on the landing page — a
// typed question that doesn't match one of the known examples gets an
// honest placeholder rather than a fabricated answer.
const PLACEHOLDER_ANSWER =
  "This is a preview of the chat interface — real answers will be generated once the backend is connected.";

// Mirrors the real product's actual constraints: a 5-saved-conversation cap
// and ~40-character auto-generated titles.
const MAX_SAVED_CONVERSATIONS = 5;
const TITLE_MAX_LEN = 40;

function makeTitle(question: string): string {
  return question.length > TITLE_MAX_LEN
    ? question.slice(0, TITLE_MAX_LEN - 1).trimEnd() + "…"
    : question;
}

const SEED_CONVERSATIONS: Conversation[] = [
  {
    id: "seed-1",
    title: makeTitle(EXAMPLE_QUESTIONS[0].question),
    messages: [EXAMPLE_QUESTIONS[0]],
  },
  {
    id: "seed-2",
    title: makeTitle(EXAMPLE_QUESTIONS[1].question),
    messages: [EXAMPLE_QUESTIONS[1]],
  },
];

function EmptyState({ onAsk }: { onAsk: (example: Message) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <p className="mb-6 text-lg text-foreground">
        Ask about a company&apos;s filings, risks, or financials
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {EXAMPLE_QUESTIONS.map((example) => (
          <button
            key={example.question}
            type="button"
            onClick={() => onAsk(example)}
            className="cursor-pointer rounded-full border border-card-border bg-card px-4 py-2 text-sm text-foreground transition-colors hover:border-accent hover:bg-accent/5"
          >
            {example.question}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ChatInterface() {
  const [conversations, setConversations] = useState<Conversation[]>(SEED_CONVERSATIONS);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  function ask(message: Message) {
    if (activeId) {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId ? { ...c, messages: [...c.messages, message] } : c
        )
      );
      return;
    }
    // Computed once, outside any setState updater, so both setters below
    // reference the same stable object — an id generated inside an updater
    // function would risk mismatching under Strict Mode's dev-only double
    // invocation of updaters.
    const newConversation: Conversation = {
      id: crypto.randomUUID(),
      title: makeTitle(message.question),
      messages: [message],
    };
    setConversations((prev) =>
      [newConversation, ...prev].slice(0, MAX_SAVED_CONVERSATIONS)
    );
    setActiveId(newConversation.id);
  }

  function startNewChat() {
    setActiveId(null);
    setInput("");
    setSidebarOpen(false);
  }

  function selectConversation(id: string) {
    setActiveId(id);
    setSidebarOpen(false);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const question = input.trim();
    if (!question) return;
    const known = EXAMPLE_QUESTIONS.find((ex) => ex.question === question);
    ask(known ?? { question, answer: PLACEHOLDER_ANSWER });
    setInput("");
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <ChatSidebar
        conversations={conversations.map(({ id, title }) => ({ id, title }))}
        activeId={activeId}
        onSelect={selectConversation}
        onNewChat={startNewChat}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile-only strip: the sidebar (and its branding) is off-canvas
            below lg, so this is the one place a menu toggle is needed. */}
        <div className="flex items-center gap-3 border-b border-card-border px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open conversations"
            className="cursor-pointer rounded-md p-1.5 text-foreground transition-colors hover:bg-accent/5"
          >
            <svg
              viewBox="0 0 20 20"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
            >
              <path d="M3 5h14M3 10h14M3 15h14" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-foreground">
            SEC Filing Analyst
          </span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {active ? (
            <div className="mx-auto w-full max-w-3xl divide-y divide-card-border px-6 py-8">
              {active.messages.map((m, i) => (
                <ChatMessage
                  key={i}
                  question={m.question}
                  answer={m.answer}
                  source={m.source}
                  chart={m.chart ? <RevenueChart /> : undefined}
                />
              ))}
            </div>
          ) : (
            <EmptyState onAsk={ask} />
          )}
        </div>

        <div className="border-t border-card-border px-6 py-4">
          <form
            onSubmit={handleSubmit}
            className="mx-auto flex w-full max-w-3xl gap-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about a company's filings…"
              aria-label="Ask a question"
              className="min-w-0 flex-1 rounded-lg border border-card-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
            <button
              type="submit"
              className="shrink-0 cursor-pointer rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground transition-all duration-200 hover:-translate-y-px hover:bg-accent-hover hover:shadow-md"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
