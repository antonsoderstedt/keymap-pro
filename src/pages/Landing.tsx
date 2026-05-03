import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Rocket,
  Search,
  TrendingUp,
  Sparkles,
  LineChart,
  ListChecks,
  BookOpen,
  ArrowRight,
  Target,
  Zap,
  ShieldCheck,
} from "lucide-react";
import AnimatedBackground from "@/components/landing/AnimatedBackground";
import HeroMockup from "@/components/landing/HeroMockup";
import ProductShowcase from "@/components/landing/ProductShowcase";
import CountUp from "@/components/landing/CountUp";

const ROTATING = ["rankar.", "konverterar.", "växer.", "skalar."];

export default function Landing() {
  const { user } = useAuth();
  const [wordIdx, setWordIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setWordIdx((i) => (i + 1) % ROTATING.length), 2200);
    return () => clearInterval(t);
  }, []);

  const features = [
    { icon: Rocket, title: "Pre-launch Blueprint", desc: "Datadriven sajtstrategi innan domänen är live. Sökord, sajtkarta, prognos." },
    { icon: Search, title: "Sökordsuniversum", desc: "AI-klustrade sökord med volym, intent och konkurrentdata." },
    { icon: TrendingUp, title: "Performance & SEO", desc: "Live rankings, GA4, GSC och Ads i en vy." },
    { icon: LineChart, title: "CRO & intäkter", desc: "Konverteringsgrader, AOV, marginal och ROI per kanal." },
    { icon: Sparkles, title: "Veckans briefing", desc: "AI-rapport med insikter, varningar och nästa steg." },
    { icon: ListChecks, title: "Action Tracker", desc: "Backlog där varje åtgärd kopplas till mätbar effekt." },
  ];

  const flow = [
    { step: "01", title: "Skapa kund", desc: "Workspace per kund med domän, marknad och valuta." },
    { step: "02", title: "Importera data", desc: "Koppla GSC/GA4/Ads — eller starta från noll." },
    { step: "03", title: "Analysera", desc: "AI bygger universum, sajtkarta och prognos." },
    { step: "04", title: "Exekvera", desc: "Action Tracker + veckobriefing håller kursen." },
  ];

  const metrics = [
    { v: 12400, suffix: "+", label: "Sökord analyserade" },
    { v: 48, suffix: "h", label: "Idé → blueprint" },
    { v: 99.9, suffix: "%", decimals: 1, label: "Datafärskhet" },
    { v: 6, suffix: "", label: "Moduler i en plattform" },
  ];

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
            <span className="font-display text-xl font-semibold tracking-tight">Slay Station</span>
          </Link>
          <nav className="flex items-center gap-1.5">
            <Link to="/docs">
              <Button variant="ghost" size="sm">
                <BookOpen className="h-4 w-4 mr-2" />
                Dokumentation
              </Button>
            </Link>
            {user ? (
              <Link to="/clients">
                <Button size="sm">
                  Workspace
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </Link>
            ) : (
              <Link to="/auth">
                <Button size="sm">Logga in</Button>
              </Link>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        <AnimatedBackground />
        <div className="container relative mx-auto px-4 pt-16 pb-24 md:pt-24 md:pb-32">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <Badge variant="outline" className="mb-6 border-primary/30 bg-primary/5 text-primary">
                <Sparkles className="h-3 w-3 mr-1.5" />
                AI-driven growth station
              </Badge>
              <h1 className="font-display text-4xl md:text-6xl font-semibold leading-[1.05] tracking-tight">
                Bygg sajter som{" "}
                <span className="relative inline-block min-w-[260px] md:min-w-[380px] text-left align-baseline">
                  {ROTATING.map((w, i) => (
                    <span
                      key={w}
                      className="absolute left-0 top-0 bg-gradient-to-r from-primary via-primary-glow to-accent bg-clip-text text-transparent transition-all duration-500"
                      style={{
                        opacity: i === wordIdx ? 1 : 0,
                        transform: `translateY(${i === wordIdx ? 0 : 12}px)`,
                      }}
                    >
                      {w}
                    </span>
                  ))}
                  <span className="invisible">{ROTATING[0]}</span>
                </span>
              </h1>
              <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-xl">
                Slay Station är growth-stationen för byråer och teams. Sökordsanalys, sajtarkitektur,
                performance-tracking och intäktsmodellering — i en plattform.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to={user ? "/clients" : "/auth"}>
                  <Button size="lg" className="shadow-elevated">
                    {user ? "Öppna workspace" : "Kom igång gratis"}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
                <Link to="/docs">
                  <Button size="lg" variant="outline">
                    <BookOpen className="h-4 w-4 mr-2" />
                    Se hur det funkar
                  </Button>
                </Link>
              </div>
              <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-mono text-muted-foreground">
                <span className="text-primary">●</span>
                <span>Lovable AI</span>
                <span className="opacity-30">·</span>
                <span>Firecrawl</span>
                <span className="opacity-30">·</span>
                <span>DataForSEO</span>
                <span className="opacity-30">·</span>
                <span>Search Console</span>
                <span className="opacity-30">·</span>
                <span>GA4</span>
              </div>
            </div>
            <div className="lg:pl-8">
              <HeroMockup />
            </div>
          </div>
        </div>
      </section>

      {/* Metrics strip */}
      <section className="border-y border-border bg-card/30">
        <div className="container mx-auto px-4 py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {metrics.map((m) => (
              <div key={m.label} className="text-center md:text-left">
                <div className="text-3xl md:text-4xl font-semibold text-primary">
                  <CountUp end={m.v} suffix={m.suffix} decimals={m.decimals ?? 0} />
                </div>
                <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Product showcase */}
      <section className="container mx-auto px-4 py-20 md:py-28">
        <div className="max-w-2xl mb-12">
          <span className="font-mono text-xs uppercase tracking-wider text-primary">Plattformen</span>
          <h2 className="mt-2 font-display text-3xl md:text-5xl font-semibold leading-tight">
            Se verktyget arbeta — på riktigt.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Inga statiska screenshots. Det här är de faktiska visualiseringar du jobbar med varje dag.
          </p>
        </div>
        <ProductShowcase />
      </section>

      {/* Features grid */}
      <section className="container mx-auto px-4 py-20 border-t border-border">
        <div className="max-w-2xl mb-12">
          <span className="font-mono text-xs uppercase tracking-wider text-primary">Moduler</span>
          <h2 className="mt-2 font-display text-3xl md:text-5xl font-semibold leading-tight">
            Allt för organisk tillväxt.
          </h2>
        </div>
        <div className="grid gap-px bg-border rounded-2xl overflow-hidden border border-border">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="group bg-background hover:bg-card transition-colors p-6 md:p-8 md:[&:nth-child(3n+1)]:border-l-0">
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">{f.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <style>{`
          .grid.gap-px > div { display: block; }
          @media (min-width: 768px) {
            section .grid.gap-px { grid-template-columns: repeat(3, 1fr); }
          }
        `}</style>
      </section>

      {/* Flow / timeline */}
      <section className="container mx-auto px-4 py-20 border-t border-border">
        <div className="max-w-2xl mb-12">
          <span className="font-mono text-xs uppercase tracking-wider text-primary">Workflow</span>
          <h2 className="mt-2 font-display text-3xl md:text-5xl font-semibold leading-tight">
            Från canvas till live på fyra steg.
          </h2>
        </div>
        <div className="relative">
          {/* timeline line */}
          <div className="hidden md:block absolute left-0 right-0 top-8 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          <div className="hidden md:block absolute left-0 top-8 h-px w-1/2 bg-gradient-to-r from-primary to-transparent animate-shimmer" />
          <div className="grid gap-8 md:grid-cols-4 relative">
            {flow.map((s, i) => (
              <div key={s.step}>
                <div className="relative h-16 w-16 rounded-full border border-primary/40 bg-background flex items-center justify-center font-mono text-sm text-primary">
                  {s.step}
                  <span className="absolute inset-0 rounded-full bg-primary/20 animate-pulse-glow" style={{ animationDelay: `${i * 0.4}s` }} />
                </div>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For who */}
      <section className="container mx-auto px-4 py-20 border-t border-border">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { icon: Target, title: "Byråer", desc: "Hantera flera kunder i separata workspaces. White-label rapporter och automatiska briefings." },
            { icon: Zap, title: "Founders & in-house", desc: "Bygg en ny sajt på data — inte gissningar. Pre-launch Blueprint ger sajtkartan innan ni kodar." },
            { icon: ShieldCheck, title: "SEO/CRO-konsulter", desc: "Visa kunden exakt vilken trafik och intäkt ditt arbete genererar — per åtgärd." },
          ].map((c) => {
            const Icon = c.icon;
            return (
              <Card key={c.title} className="border-border bg-card/60 backdrop-blur hover:border-primary/40 transition-colors">
                <CardContent className="p-6">
                  <Icon className="h-6 w-6 text-primary mb-3" />
                  <h3 className="font-semibold mb-2">{c.title}</h3>
                  <p className="text-sm text-muted-foreground">{c.desc}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 py-20">
        <div className="relative rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-accent/10 overflow-hidden">
          <div className="absolute inset-0 bg-grid mask-radial-fade opacity-30" />
          {/* sparks */}
          {[...Array(6)].map((_, i) => (
            <span
              key={i}
              className="absolute bottom-0 h-1.5 w-1.5 rounded-full bg-primary animate-spark"
              style={{ left: `${15 + i * 13}%`, animationDelay: `${i * 0.5}s` }}
            />
          ))}
          <div className="relative p-10 md:p-16 text-center">
            <h2 className="font-display text-3xl md:text-5xl font-semibold leading-tight mb-4">
              Klar att börja äga din tillväxt?
            </h2>
            <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Skapa ditt första kund-workspace på under en minut. Eller läs dokumentationen först om du vill se hur allt hänger ihop.
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Link to={user ? "/clients" : "/auth"}>
                <Button size="lg" className="shadow-elevated">
                  {user ? "Till mitt workspace" : "Skapa konto"}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
              <Link to="/docs">
                <Button size="lg" variant="outline">
                  Knowledge base
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="container mx-auto px-4 py-8 text-sm text-muted-foreground flex flex-wrap justify-between gap-4">
          <span>© {new Date().getFullYear()} Slay Station</span>
          <div className="flex gap-4">
            <Link to="/docs" className="hover:text-foreground">Dokumentation</Link>
            <Link to="/auth" className="hover:text-foreground">Logga in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
