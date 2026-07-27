"use client";

import Link from "next/link";

export default function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  open,
  onClose,
}: {
  conversations: { id: string; title: string }[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {/* Off-canvas backdrop, mobile only — a real button rather than a div
          so dismissing the sidebar is keyboard- and screen-reader-reachable. */}
      {open && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-foreground/20 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col border-r border-card-border bg-card transition-all duration-200 lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="border-b border-card-border px-5 py-5">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight text-foreground"
          >
            SEC Filing Analyst
          </Link>
        </div>

        <div className="px-4 pt-4">
          <button
            type="button"
            onClick={onNewChat}
            className="w-full cursor-pointer rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-all duration-200 hover:-translate-y-px hover:bg-accent-hover hover:shadow-md"
          >
            + New chat
          </button>
        </div>

        <div className="mt-5 flex-1 overflow-y-auto px-4">
          <p className="mb-2 px-1 text-xs tracking-wide text-muted-foreground uppercase">
            Conversations (up to 5 saved)
          </p>
          {conversations.length === 0 ? (
            <p className="px-1 py-2 text-sm text-muted-foreground">
              No conversations yet.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    aria-current={c.id === activeId}
                    className={`w-full cursor-pointer truncate rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      c.id === activeId
                        ? "bg-accent/8 font-medium text-foreground"
                        : "text-muted-foreground hover:bg-accent-hover/8 hover:text-foreground"
                    }`}
                  >
                    {c.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-card-border px-5 py-4">
          <Link
            href="/"
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Back to home
          </Link>
        </div>
      </aside>
    </>
  );
}
