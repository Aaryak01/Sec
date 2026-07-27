import type { ReactNode } from "react";

/** One exchange in the flowing thread — no card, no border wrapper. Weight
 * carries the distinction the boxed version used color+borders for: the
 * question is navy and bold, the answer is regular-weight secondary text.
 * The parent list supplies the divider between exchanges (divide-y), so this
 * component only ever draws its own content. */
export default function ChatMessage({
  question,
  answer,
  source,
  chart,
}: {
  question: string;
  answer: string;
  source?: string;
  chart?: ReactNode;
}) {
  return (
    <div className="py-8 first:pt-0">
      <p className="mb-3 text-sm font-semibold text-foreground">{question}</p>
      <p className="text-sm leading-relaxed text-muted-foreground">{answer}</p>
      {chart && <div className="mt-4">{chart}</div>}
      {source && (
        <p className="mt-3 font-mono text-xs text-muted-foreground/80">
          {source}
        </p>
      )}
    </div>
  );
}
