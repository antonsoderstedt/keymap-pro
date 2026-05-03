export default function SitemapGraph() {
  const nodes = [
    { x: 150, y: 30, label: "Hem", root: true },
    { x: 50, y: 100, label: "Tjänster" },
    { x: 150, y: 100, label: "Bransch" },
    { x: 250, y: 100, label: "Blogg" },
    { x: 20, y: 165, label: "SEO" },
    { x: 80, y: 165, label: "CRO" },
    { x: 130, y: 165, label: "Retail" },
    { x: 180, y: 165, label: "SaaS" },
    { x: 230, y: 165, label: "Guide" },
    { x: 280, y: 165, label: "Case" },
  ];
  const edges = [
    [0, 1], [0, 2], [0, 3],
    [1, 4], [1, 5],
    [2, 6], [2, 7],
    [3, 8], [3, 9],
  ];
  return (
    <svg viewBox="0 0 300 200" className="w-full h-full">
      {edges.map(([a, b], i) => (
        <line
          key={i}
          x1={nodes[a].x}
          y1={nodes[a].y}
          x2={nodes[b].x}
          y2={nodes[b].y}
          stroke="hsl(var(--primary) / 0.4)"
          strokeWidth="1"
          className="animate-draw-line"
          style={{ animationDelay: `${i * 0.1}s` }}
        />
      ))}
      {nodes.map((n, i) => (
        <g key={i}>
          <rect
            x={n.x - 26}
            y={n.y - 9}
            width="52"
            height="18"
            rx="4"
            fill={n.root ? "hsl(var(--primary))" : "hsl(var(--card))"}
            stroke="hsl(var(--primary) / 0.6)"
            strokeWidth="1"
          />
          <text
            x={n.x}
            y={n.y + 3}
            textAnchor="middle"
            fontSize="8"
            fontFamily="JetBrains Mono"
            fill={n.root ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))"}
          >
            {n.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
