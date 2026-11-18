/**
 * Hero illustration: a circuit board whose traces draw in and a chip that tilts toward the pointer
 * (animated by home-motion.tsx). Pure SVG coloured with theme tokens; no images, no WebGL.
 */
const TRACES = [
  "M20 60 H120 V120 H170",
  "M20 140 H90 V180 H170",
  "M20 220 H110 V200 H170",
  "M20 300 H130 V240 H170",
  "M380 70 H300 V120 H250",
  "M380 150 H320 V170 H250",
  "M380 230 H290 V210 H250",
  "M380 310 H310 V250 H250",
  "M190 20 V100",
  "M230 20 V60 H260 V100",
  "M190 360 V270",
  "M230 360 V320 H200 V270",
];
const PADS: [number, number][] = [
  [20, 60],
  [20, 140],
  [20, 220],
  [20, 300],
  [380, 70],
  [380, 150],
  [380, 230],
  [380, 310],
  [190, 20],
  [230, 20],
  [190, 360],
  [230, 360],
];

export function CircuitIllustration() {
  return (
    <div className="relative aspect-square w-full [perspective:900px]" aria-hidden>
      <div className="absolute inset-6 rounded-[2.5rem] bg-gradient-to-br from-card to-lavender/40 shadow-xl ring-1 ring-foreground/5" />
      <svg viewBox="0 0 400 380" className="relative size-full" fill="none">
        <g strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="stroke-lavender-foreground/50">
          {TRACES.map((d, i) => (
            <path key={i} d={d} data-trace />
          ))}
        </g>
        <g className="fill-mint-foreground/70">
          {PADS.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="6" data-pad />
          ))}
        </g>
        <g data-chip style={{ transformOrigin: "210px 185px", transformBox: "view-box" }}>
          <rect x="150" y="95" width="120" height="180" rx="16" className="fill-primary" />
          <rect x="165" y="110" width="90" height="150" rx="10" className="fill-primary-foreground/10" />
          {Array.from({ length: 6 }).map((_, i) => (
            <g key={i} className="fill-primary/70">
              <rect x="138" y={112 + i * 26} width="12" height="8" rx="2" />
              <rect x="270" y={112 + i * 26} width="12" height="8" rx="2" />
            </g>
          ))}
          <text
            x="210"
            y="192"
            textAnchor="middle"
            className="fill-primary-foreground font-mono text-[18px] font-bold tracking-widest"
          >
            IC
          </text>
          <circle cx="175" cy="125" r="4" className="fill-primary-foreground/60" />
        </g>
      </svg>
    </div>
  );
}
