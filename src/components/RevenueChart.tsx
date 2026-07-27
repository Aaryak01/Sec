const DATA = [
  { year: "FY22", value: 81 },
  { year: "FY23", value: 97 },
  { year: "FY24", value: 98 },
  { year: "FY25", value: 92 },
];

const BAR_WIDTH = 48;
const GAP = 28;
const CHART_HEIGHT = 110;
const WIDTH = DATA.length * (BAR_WIDTH + GAP);

/** Hand-rolled inline SVG rather than a charting dependency — matches how
 * every other visual on this site (icons, the hero card) is built from
 * scratch rather than pulled in. Same shape of data the real product's own
 * chart tool already narrates: revenue peaking in FY24, pulling back in
 * FY25. */
export default function RevenueChart() {
  const max = Math.max(...DATA.map((d) => d.value));
  return (
    <div className="rounded-lg border border-card-border bg-background p-4">
      <svg
        viewBox={`0 0 ${WIDTH} ${CHART_HEIGHT + 24}`}
        className="w-full"
        role="img"
        aria-label="Tesla revenue by fiscal year, in billions of dollars: FY22 $81B, FY23 $97B, FY24 $98B, FY25 $92B"
      >
        {DATA.map((d, i) => {
          const barHeight = (d.value / max) * CHART_HEIGHT;
          const x = i * (BAR_WIDTH + GAP) + GAP / 2;
          const y = CHART_HEIGHT - barHeight;
          return (
            <g key={d.year}>
              <rect
                x={x}
                y={y}
                width={BAR_WIDTH}
                height={barHeight}
                rx={4}
                className="fill-accent"
              />
              <text
                x={x + BAR_WIDTH / 2}
                y={CHART_HEIGHT + 16}
                textAnchor="middle"
                className="fill-muted-foreground font-mono"
                style={{ fontSize: 11 }}
              >
                {d.year}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
