import AuthForm from "@/components/AuthForm";
import HeroDemo from "@/components/HeroDemo";
import SiteHeader from "@/components/SiteHeader";

const EXPLAINERS = [
  {
    index: "01",
    title: "Ask in plain English",
    body: "Ask about risk factors, financials, or strategy for 10 major tech companies, and get answers grounded in the actual filing text.",
    mock: (
      <>
        <p className="text-muted-foreground">
          {"> What are Tesla's biggest risks?"}
        </p>
        <p className="mt-1 text-foreground">
          &quot;Competition from established and emerging automakers…&quot;
        </p>
      </>
    ),
  },
  {
    index: "02",
    title: "Compare on the numbers",
    body: "Line companies up side by side on revenue, margin, and other core metrics, pulled straight from their filings.",
    mock: (
      <>
        <p className="text-muted-foreground">Revenue (FY24)</p>
        <div className="mt-1 flex justify-between text-foreground">
          <span>AAPL</span>
          <span>$391B</span>
        </div>
        <div className="flex justify-between text-foreground">
          <span>MSFT</span>
          <span>$245B</span>
        </div>
      </>
    ),
  },
  {
    index: "03",
    title: "Track how language changes",
    body: "See how a company's risk disclosures shift year over year, so you can spot when the tone gets more cautious or more confident.",
    mock: (
      <>
        <p className="text-muted-foreground">
          2023: &quot;may be subject to…&quot;
        </p>
        <p className="mt-1 text-foreground">
          2024: &quot;is likely to result in…&quot;
        </p>
      </>
    ),
  },
];

export default function Home() {
  return (
    <>
      <SiteHeader rightLabel="Sign in" rightHref="#auth" />

      <main className="flex-1">
        {/* Hero — grid-cols-[2fr_3fr] rather than an even split: the card is
            meant to be the visual centerpiece, so it gets more of the row. */}
        <section className="mx-auto flex w-full max-w-7xl flex-col items-center gap-12 px-6 pt-16 pb-16 text-center lg:grid lg:grid-cols-[2fr_3fr] lg:items-center lg:gap-16 lg:pt-24 lg:pb-24 lg:text-left">
          <div className="flex max-w-xl flex-col items-center lg:items-start">
            <h1 className="text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl">
              SEC Filing Analyst
            </h1>
            <p className="mt-5 max-w-xl text-lg text-balance text-muted-foreground">
              Ask questions about real SEC filings in plain English, and get
              answers grounded in the exact text — not guesses.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
              <a
                href="#auth"
                className="rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground transition-all duration-200 hover:-translate-y-px hover:bg-accent-hover hover:shadow-md"
              >
                Get started
              </a>
              <a
                href="#auth"
                className="rounded-lg border border-accent bg-transparent px-6 py-3 text-sm font-semibold text-accent transition-all duration-200 hover:-translate-y-px hover:bg-card hover:shadow-md"
              >
                Sign in
              </a>
            </div>
          </div>

          <div className="flex w-full justify-center lg:justify-end">
            <HeroDemo />
          </div>
        </section>

        {/* Explainer — one unified report block, internally divided, rather
            than three separate cards floating with margin between them. The
            hero is the "wow" moment; this is the supporting explanation, so
            it stays more compact and grounded than the hero by design. */}
        <section className="mx-auto w-full max-w-6xl border-t border-card-border px-6 pt-12 pb-14 sm:pt-14 sm:pb-16">
          <div className="grid grid-cols-1 divide-y divide-card-border rounded-[20px] border border-card-border bg-card shadow-[0_3px_10px_rgba(33,33,69,0.06),0_10px_24px_rgba(33,33,69,0.06)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {EXPLAINERS.map(({ index, title, body, mock }) => (
              <div key={title} className="p-8">
                <p className="mb-3 font-mono text-xs text-muted-foreground">
                  {index}
                </p>
                <h3 className="mb-1.5 text-base font-semibold text-foreground">
                  {title}
                </h3>
                <p className="mb-4 text-sm text-muted-foreground">{body}</p>
                <div className="rounded-lg border border-card-border bg-background p-3 font-mono text-xs">
                  {mock}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Disclaimer */}
        <section className="mx-auto w-full max-w-2xl border-t border-card-border px-6 pt-16 pb-20 sm:pt-20 sm:pb-28">
          <p className="text-center text-xs text-muted-foreground">
            SEC Filing Analyst is an educational tool for reading public
            filings. Nothing it says is financial advice or a recommendation
            to buy, sell, or hold any security.
          </p>
        </section>

        {/* Auth */}
        <section className="mx-auto flex w-full max-w-5xl flex-col items-center border-t border-card-border px-6 pt-16 pb-20 sm:pt-20 sm:pb-28">
          <div className="mb-8 flex flex-col items-center">
            <div className="mb-6 h-px w-16 bg-card-border" />
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Start analyzing SEC filings in seconds
            </h2>
          </div>
          <AuthForm />
        </section>
      </main>

      <footer className="border-t border-card-border px-6 py-8">
        <p className="mx-auto max-w-3xl text-center text-xs text-muted-foreground">
          Under the hood: retrieval-augmented generation over real SEC
          filings — every answer traces back to a specific passage in a
          specific filing, rather than being generated from memory.
        </p>
      </footer>
    </>
  );
}
