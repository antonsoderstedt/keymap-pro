export default function AnimatedBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* drifting blobs */}
      <div
        className="absolute -top-32 -left-32 h-[480px] w-[480px] rounded-full opacity-40 blur-3xl animate-gradient-drift"
        style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.55), transparent 70%)" }}
      />
      <div
        className="absolute top-1/3 -right-32 h-[520px] w-[520px] rounded-full opacity-30 blur-3xl animate-gradient-drift"
        style={{ background: "radial-gradient(circle, hsl(var(--accent) / 0.5), transparent 70%)", animationDelay: "-6s" }}
      />
      <div
        className="absolute bottom-0 left-1/3 h-[420px] w-[420px] rounded-full opacity-25 blur-3xl animate-gradient-drift"
        style={{ background: "radial-gradient(circle, hsl(var(--primary-glow) / 0.5), transparent 70%)", animationDelay: "-12s" }}
      />
      {/* grid */}
      <div className="absolute inset-0 bg-grid mask-radial-fade opacity-40" />
    </div>
  );
}
