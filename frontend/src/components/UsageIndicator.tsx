"use client";

import type { UsageInfo } from "@/lib/chat-api";

// Pro tier has no limit to show progress against — rendering nothing here
// (rather than "Unlimited") keeps the input area uncluttered for the tier
// that doesn't need to think about this at all.
export default function UsageIndicator({
  usage,
  onUpgradeClick,
}: {
  usage: UsageInfo | null;
  onUpgradeClick: () => void;
}) {
  if (!usage || usage.tier === "pro" || usage.messages_limit === null) {
    return null;
  }

  const isNearLimit = usage.messages_used >= usage.messages_limit - 2;

  return (
    <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-1 pb-2 text-xs">
      <span className={isNearLimit ? "font-medium text-accent" : "text-muted-foreground"}>
        {usage.messages_used}/{usage.messages_limit} messages today
      </span>
      <button
        type="button"
        onClick={onUpgradeClick}
        className="cursor-pointer font-medium text-accent hover:underline"
      >
        Upgrade to Pro
      </button>
    </div>
  );
}
