"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getCurrentUser, signOut, fetchAuthSession } from "aws-amplify/auth";
import ChatMessage from "./ChatMessage";
import ChatSidebar from "./ChatSidebar";
import UsageIndicator from "./UsageIndicator";
import UpgradeModal from "./UpgradeModal";
import {
  sendChatMessage,
  listConversations,
  getConversation,
  saveConversation,
  deleteConversation,
  getUsage,
  confirmCheckout,
  type ChatSource,
  type HistoryTurn,
  type UsageInfo,
} from "@/lib/chat-api";

type Message = {
  question: string;
  answer: string;
  source?: string;
  chartBase64?: string;
};
type Conversation = { id: string; title: string; messages: Message[] };

// Example prompts shown as clickable chips in the empty state — plain
// strings now, not canned Q&A: clicking one sends a real question to the
// real API, the same as typing it.
const EXAMPLE_QUESTIONS = [
  "What was Apple's revenue in FY 2025?",
  "What are Nvidia's biggest supply chain risks?",
  "Show me Tesla's revenue trend.",
];

// Mirrors the real product's actual constraint: a 5-saved-conversation cap
// (matches api.py's backend and the earlier Gradio app's storage.py).
const MAX_SAVED_CONVERSATIONS = 5;
const TITLE_MAX_LEN = 40;

function makeTitle(question: string): string {
  return question.length > TITLE_MAX_LEN
    ? question.slice(0, TITLE_MAX_LEN - 1).trimEnd() + "…"
    : question;
}

/** Flattens this conversation's Q&A pairs into the alternating user/assistant
 * turns the API expects — matching exactly how api.py's own /chat handler
 * reconstructs history (see the comment in api.py's chat() function): the
 * turn currently being asked is NOT included here, since the caller appends
 * it separately, mirroring app.py's bot_respond() convention. */
function toHistory(messages: Message[]): HistoryTurn[] {
  const turns: HistoryTurn[] = [];
  for (const m of messages) {
    turns.push({ role: "user", content: m.question });
    turns.push({ role: "assistant", content: m.answer });
  }
  return turns;
}

/** Inverse of toHistory() — pairs up alternating user/assistant turns loaded
 * from the backend back into this component's question/answer shape. Charts
 * and parsed sources are never persisted server-side (only role/content), so
 * a reloaded conversation's messages never have chartBase64/source set. */
function fromHistory(turns: HistoryTurn[]): Message[] {
  const messages: Message[] = [];
  for (let i = 0; i < turns.length; i += 2) {
    messages.push({
      question: turns[i]?.content ?? "",
      answer: turns[i + 1]?.content ?? "",
    });
  }
  return messages;
}

function formatSources(sources: ChatSource[] | null): string | undefined {
  if (!sources || sources.length === 0) return undefined;
  return sources.map((s) => s.raw).join("\n");
}

function EmptyState({ onAsk }: { onAsk: (question: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <p className="mb-6 text-lg text-foreground">
        Ask about a company&apos;s filings, risks, or financials
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {EXAMPLE_QUESTIONS.map((question) => (
          <button
            key={question}
            type="button"
            onClick={() => onAsk(question)}
            className="cursor-pointer rounded-full border border-card-border bg-card px-4 py-2 text-sm text-foreground transition-colors hover:border-accent hover:bg-accent/5"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ChatInterface() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pending, setPending] = useState(false);
  // null = still checking, so the real chat UI never flashes before a
  // redirect for a genuinely signed-out visitor.
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  // Distinct from `usage.messages_used >= limit` — set only from an actual
  // limit_reached response, so the banner appears the moment the block
  // happens rather than only after a page refresh re-fetches /usage.
  const [limitReached, setLimitReached] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeConfirmedMessage, setUpgradeConfirmedMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCurrentUser()
      .then(async () => {
        if (cancelled) return;
        setAuthorized(true);
        // Best-effort: if fetching the token or the saved-conversation list
        // fails, the user is still signed in — the sidebar just starts
        // empty rather than blocking the whole page on a redirect.
        try {
          const session = await fetchAuthSession();
          const token = session.tokens?.accessToken?.toString();
          if (!token || cancelled) return;
          setAccessToken(token);

          const [list, usageInfo] = await Promise.all([
            listConversations(token),
            getUsage(token),
          ]);
          if (cancelled) return;
          setConversations(
            list.map((c) => ({ id: c.id, title: c.title, messages: [] }))
          );
          setUsage(usageInfo);
          if (usageInfo.tier === "free" && usageInfo.messages_limit !== null) {
            setLimitReached(usageInfo.messages_used >= usageInfo.messages_limit);
          }

          // Returning from Stripe Checkout: success_url carries these two
          // params. Confirming here (rather than trusting the redirect
          // alone) is what actually applies the upgrade — see api.py's
          // /billing/confirm comment for why this checks the session
          // directly instead of waiting on a webhook.
          const upgradeStatus = searchParams.get("upgrade");
          const sessionId = searchParams.get("session_id");
          if (upgradeStatus === "success" && sessionId) {
            try {
              const updatedUsage = await confirmCheckout(token, sessionId);
              if (cancelled) return;
              setUsage(updatedUsage);
              setLimitReached(false);
              setUpgradeConfirmedMessage(
                "You're on Pro now — unlimited messages, no daily limit."
              );
            } catch {
              // Checkout may have already been confirmed by a prior load
              // (e.g. the user refreshed) or genuinely failed — either way,
              // silently re-fetching current usage below is the safe
              // fallback rather than showing a scary error for a likely
              // no-op.
            }
          }
          if (upgradeStatus) {
            router.replace("/chat");
          }
        } catch {
          // sidebar/usage stay empty
        }
      })
      .catch(() => {
        if (!cancelled) router.replace("/");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function handleSignOut() {
    await signOut();
    router.push("/");
  }

  const active = conversations.find((c) => c.id === activeId) ?? null;

  // Returns the conversation's id and its full message list after the
  // append, so ask() can persist exactly what's now shown without racing
  // React's batched state update.
  function appendMessage(message: Message): { id: string; messages: Message[] } {
    if (activeId) {
      const current = conversations.find((c) => c.id === activeId);
      const messages = [...(current?.messages ?? []), message];
      setConversations((prev) =>
        prev.map((c) => (c.id === activeId ? { ...c, messages } : c))
      );
      return { id: activeId, messages };
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
    return { id: newConversation.id, messages: newConversation.messages };
  }

  // Moves a just-saved conversation to the top of the sidebar list, mirroring
  // the backend's updated_at-descending ordering without a full re-fetch.
  function bumpToTop(id: string) {
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx <= 0) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.unshift(item);
      return copy;
    });
  }

  async function ask(question: string) {
    if (!accessToken || limitReached) return;
    const priorMessages = active?.messages ?? [];
    setPending(true);
    try {
      const result = await sendChatMessage(accessToken, question, toHistory(priorMessages));
      setUsage(result.usage);

      if (result.limit_reached) {
        // No real answer was produced — don't spend a chat turn on it, and
        // don't fall through to saveConversation below. The banner (driven
        // by `limitReached`) is what communicates this, not a chat bubble.
        setLimitReached(true);
        return;
      }

      const { id, messages } = appendMessage({
        question,
        answer: result.response,
        source: formatSources(result.sources),
        chartBase64: result.chart ?? undefined,
      });
      saveConversation(accessToken, id, makeTitle(messages[0].question), toHistory(messages))
        .then(() => bumpToTop(id))
        .catch(() => {
          // Best-effort persistence: the message is still shown locally
          // even if the save call failed (e.g. transient network issue).
        });
    } catch {
      appendMessage({
        question,
        answer:
          "Sorry — I couldn't reach the server. Make sure the API is running at " +
          (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000") +
          " and try again.",
      });
    } finally {
      setPending(false);
    }
  }

  function startNewChat() {
    setActiveId(null);
    setInput("");
    setSidebarOpen(false);
  }

  async function selectConversation(id: string) {
    setActiveId(id);
    setSidebarOpen(false);
    const conv = conversations.find((c) => c.id === id);
    if (!accessToken || (conv && conv.messages.length > 0)) return;
    try {
      const detail = await getConversation(accessToken, id);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, messages: fromHistory(detail.messages) } : c
        )
      );
    } catch {
      // Leave it empty on failure — the user can still start typing.
    }
  }

  async function deleteConversationById(id: string) {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) setActiveId(null);
    if (!accessToken) return;
    try {
      await deleteConversation(accessToken, id);
    } catch {
      // Best-effort: already removed locally; a stale row may linger
      // server-side until the next successful delete or eviction.
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const question = input.trim();
    if (!question || pending) return;
    setInput("");
    ask(question);
  }

  if (authorized !== true) {
    // Deliberately minimal, not a styled loading component — this state is
    // only ever visible for the moment it takes getCurrentUser() to resolve.
    return (
      <div className="flex h-dvh w-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <ChatSidebar
        conversations={conversations.map(({ id, title }) => ({ id, title }))}
        activeId={activeId}
        onSelect={selectConversation}
        onNewChat={startNewChat}
        onDelete={deleteConversationById}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSignOut={handleSignOut}
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
            <div className="mx-auto w-full max-w-3xl px-6 py-8">
              {active.messages.map((m, i) => (
                <ChatMessage
                  key={i}
                  question={m.question}
                  answer={m.answer}
                  source={m.source}
                  chart={
                    m.chartBase64 ? (
                      <div className="rounded-lg border border-card-border bg-background p-4">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`data:image/png;base64,${m.chartBase64}`}
                          alt="Chart"
                          className="w-full"
                        />
                      </div>
                    ) : undefined
                  }
                />
              ))}
              {pending && (
                <p className="py-8 text-sm text-muted-foreground first:pt-0">
                  Thinking…
                </p>
              )}
            </div>
          ) : (
            <EmptyState onAsk={ask} />
          )}
        </div>

        <div className="border-t border-card-border px-6 py-4">
          {upgradeConfirmedMessage && (
            <div className="mx-auto mb-3 w-full max-w-3xl rounded-lg border border-accent/30 bg-accent/8 px-4 py-2.5 text-sm text-foreground">
              {upgradeConfirmedMessage}
            </div>
          )}

          {limitReached ? (
            // Replaces the input entirely rather than just disabling it —
            // this is meant to read as "here's what to do next," not as a
            // grayed-out dead end.
            <div className="mx-auto w-full max-w-3xl rounded-lg border border-card-border bg-card px-5 py-4 text-center">
              <p className="mb-3 text-sm text-foreground">
                You&apos;ve reached today&apos;s free limit of{" "}
                {usage?.messages_limit ?? 10} messages.
                {usage?.resets_at && (
                  <>
                    {" "}
                    Your limit resets at{" "}
                    {new Date(usage.resets_at).toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                      timeZoneName: "short",
                    })}
                    .
                  </>
                )}
              </p>
              <button
                type="button"
                onClick={() => setShowUpgradeModal(true)}
                className="cursor-pointer rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground transition-all duration-200 hover:-translate-y-px hover:bg-accent-hover hover:shadow-md"
              >
                Upgrade to Pro for unlimited messages
              </button>
            </div>
          ) : (
            <>
              <UsageIndicator usage={usage} onUpgradeClick={() => setShowUpgradeModal(true)} />
              <form
                onSubmit={handleSubmit}
                className="mx-auto flex w-full max-w-3xl gap-3"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={pending}
                  placeholder="Ask about a company's filings…"
                  aria-label="Ask a question"
                  className="min-w-0 flex-1 rounded-lg border border-card-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={pending}
                  className="shrink-0 cursor-pointer rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground transition-all duration-200 hover:-translate-y-px hover:bg-accent-hover hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
                >
                  {pending ? "Thinking…" : "Send"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      <UpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        accessToken={accessToken}
      />
    </div>
  );
}
