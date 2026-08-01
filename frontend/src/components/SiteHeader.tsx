import Link from "next/link";

/** Shared between the landing page and the chat page so they're guaranteed
 * to look identical rather than "similar by coincidence" — the whole point
 * of the chat page is zero visual discontinuity from the landing page. */
export default function SiteHeader({
  rightLabel,
  rightHref,
}: {
  rightLabel: string;
  rightHref: string;
}) {
  return (
    <header className="border-b border-card-border">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-foreground"
        >
          SEC Filing Analyst
        </Link>
        <Link
          href={rightHref}
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {rightLabel}
        </Link>
      </div>
    </header>
  );
}
