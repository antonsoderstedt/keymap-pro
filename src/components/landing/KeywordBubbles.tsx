const bubbles = [
  { x: 70,  y: 90,  r: 38, label: "seo verktyg",   c: 1 },
  { x: 175, y: 70,  r: 28, label: "sökord",        c: 1 },
  { x: 240, y: 130, r: 32, label: "konvertering",  c: 2 },
  { x: 130, y: 145, r: 22, label: "cro",           c: 2 },
  { x: 50,  y: 160, r: 18, label: "ranking",       c: 3 },
  { x: 215, y: 45,  r: 16, label: "ga4",           c: 3 },
  { x: 280, y: 75,  r: 14, label: "gsc",           c: 1 },
];
const colors = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--primary-glow))"];
export default function KeywordBubbles() {
  return (
    <svg viewBox="0 0 320 200" className="w-full h-full">
      {bubbles.map((b, i) => (
        <g key={i} className="animate-float-y" style={{ animationDelay: `${i * 0.4}s`, transformOrigin: `${b.x}px ${b.y}px` }}>
          <circle cx={b.x} cy={b.y} r={b.r} fill={colors[b.c - 1]} fillOpacity={0.2} stroke={colors[b.c - 1]} strokeWidth="1" />
          <text x={b.x} y={b.y + 3} textAnchor="middle" fontSize="8" fontFamily="JetBrains Mono" fill="hsl(var(--foreground))">
            {b.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
