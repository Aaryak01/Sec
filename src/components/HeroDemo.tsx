"use client";

import { useEffect, useRef, useState } from "react";

type Scenario = { question: string; answer: string; source: string };

// These map to the four real answer patterns the backend produces — metric
// lookup, filing search, comparison, tone-over-time — and the sentences
// themselves are close paraphrases of actual output, not an idealized
// mockup. A hero demo that shows a response shape the product can't
// actually produce (an earlier version of this card showed a cross-company
// "mention count" table the backend has no way to generate) misrepresents
// the product, which matters more here than looking impressively dense.
const SCENARIOS: Scenario[] = [
  {
    question: "What was Apple's revenue in FY 2025?",
    answer:
      "Apple reported $416.2B in revenue for FY 2025, up 6.4% from FY 2024.",
    // Metric answers come from structured financial data, not a cited
    // filing passage — the source line says so rather than pointing at a
    // specific Item as if this were a quote.
    source: "Apple, 10-K — Financial Statements",
  },
  {
    question: "What are Nvidia's biggest supply chain risks?",
    answer:
      "Nvidia's filings cite chip fabrication capacity as a primary supply chain concern, mentioned across multiple recent quarters.",
    source: "Nvidia, 10-K — Item 1A",
  },
  {
    question: "How does Apple's gross margin compare to Tesla's?",
    answer:
      "Apple's gross margin (46.9%) is notably higher than Tesla's (18.0%), reflecting Apple's software/services mix versus Tesla's manufacturing-heavy model.",
    source: "Apple & Tesla, 10-K — Financial Statements",
  },
  {
    question: "How has Tesla's risk factor language changed since 2023?",
    answer:
      "Tesla's risk factor language has grown more cautious since 2023, with new disclosures around AI regulation appearing in the most recent filing.",
    source: "Tesla, 10-K — Item 1A",
  },
];

const HOLD_MS = 5000;
// Slower than a typical UI fade on purpose — "calm and premium," a terminal
// quietly updating rather than a UI element reacting to a click.
const FADE_MS = 900;
const SLIDE_PX = 6;

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export default function HeroDemo() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const reducedMotion = useReducedMotion();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (reducedMotion) return;

    function cycle() {
      const fadeOut = setTimeout(() => setVisible(false), HOLD_MS);
      const advance = setTimeout(() => {
        setIndex((i) => (i + 1) % SCENARIOS.length);
        setVisible(true);
      }, HOLD_MS + FADE_MS);
      timers.current.push(fadeOut, advance);
    }

    cycle();
    const interval = setInterval(cycle, HOLD_MS + FADE_MS);
    return () => {
      clearInterval(interval);
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [reducedMotion]);

  const scenario = SCENARIOS[index];

  return (
    <div className="w-full max-w-xl rounded-[20px] border border-card-border bg-card p-8 shadow-[0_2px_8px_rgba(33,33,69,0.06),0_16px_40px_rgba(33,33,69,0.10)] sm:p-10">
      <div
        className="transition-[opacity,transform] ease-in-out"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : `translateY(-${SLIDE_PX}px)`,
          transitionDuration: `${FADE_MS}ms`,
        }}
      >
        <div className="pb-6">
          <p className="mb-2 text-xs tracking-wide text-muted-foreground uppercase">
            Question
          </p>
          <p className="text-sm text-foreground">{scenario.question}</p>
        </div>

        <div className="border-t border-card-border py-6">
          {/* min-height reserves room for the longest answer so the card
              doesn't resize as shorter scenarios rotate through — a height
              jump mid-crossfade would read as "flashy," not "subtle." Answer
              text is the normal body font, not monospace — a real answer
              from the product is a written sentence, not a data row; the
              monospace accent is reserved for the source citation below. */}
          <div className="min-h-[80px]">
            <p className="text-sm leading-relaxed text-foreground">
              {scenario.answer}
            </p>
          </div>
        </div>

        <div className="border-t border-card-border pt-6">
          <p className="mb-2 text-xs tracking-wide text-muted-foreground uppercase">
            Source
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {scenario.source}
          </p>
        </div>
      </div>
    </div>
  );
}
