import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** One exchange in the flowing thread — no card, no border wrapper. Weight
 * carries the distinction the boxed version used color+borders for: the
 * question is navy and bold, the answer is regular-weight secondary text.
 * The parent list supplies the divider between exchanges (divide-y), so this
 * component only ever draws its own content.
 *
 * Answers are rendered as markdown (Cohere's output uses **bold**, bullet
 * lists, etc.) — deterministic template answers are plain sentences with no
 * markdown syntax in them, so they pass through react-markdown unchanged. */
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
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_strong]:font-semibold [&_strong]:text-foreground [&_a]:underline [&_code]:rounded [&_code]:bg-foreground/5 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
      </div>
      {chart && <div className="mt-4">{chart}</div>}
      {source && (
        <p className="mt-3 font-mono text-xs text-muted-foreground/80">
          {source}
        </p>
      )}
    </div>
  );
}
