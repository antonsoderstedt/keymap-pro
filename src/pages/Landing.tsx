import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

export default function Landing() {
  const { user } = useAuth();

  const features = [
    {
      icon: Rocket,
      title: "Pre-launch Blueprint",
      desc: "Bygg en datadriven sajtstrategi innan domänen ens är live. Sökord, sajtkarta, marknadsanalys & intäktsprognos från en affärsidé.",
    },
    {
      icon: Search,
      title: "Sökordsuniversum",
      desc: "AI-klustrade sökord med volym, intent och konkurrentdata. Bygg innehåll som faktiskt rankar.",
    },
    {
      icon: TrendingUp,
      title: "Performance & SEO-tracking",
      desc: "Live rankings, GA4, GSC och Google Ads i en vy. Se exakt vilka åtgärder som flyttar nålen.",
    },
    {
      icon: LineChart,
      title: "CRO & intäktsmodellering",
      desc: "Konverteringsgrader, AOV, marginal och ROI per kanal. Optimera där pengarna finns.",
    },
    {
      icon: Sparkles,
      title: "Veckans briefing",
      desc: "AI-genererad veckorapport med insikter, varningar och nästa steg — levererad automatiskt.",
    },
    {
      icon: ListChecks,
      title: "Action Tracker",
      desc: "Backlog med impact-mätning. Varje åtgärd kopplas till mätbar effekt på trafik och intäkt.",
    },
  ];

  const flow = [
    { step: "1", title: "Skapa kund", desc: "Lägg upp ett workspace per kund med domän, marknad och valuta." },
    { step: "2", title: "Importera eller starta från noll", desc: "Koppla GSC/GA4/Ads — eller kör Pre-launch Blueprint utan data." },
    { step: "3", title: "Analysera", desc: "AI bygger sökordsuniversum, sajtkarta, strategi och prognos." },
    { step: "4", title: "Exekvera & mät", desc: "Action Tracker + veckobriefing håller dig på rätt kurs." },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <Link to="/" className="font-serif text-2xl text-primary">
            Slay Station
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/docs">
              <Button variant="ghost" size="sm">
                <BookOpen className="h-4 w-4 mr-2" />
                Dokumentation
              </Button>
            </Link>
            {user ? (
              <Link to="/clients">
                <Button size="sm">
                  Mitt workspace
                  <ArrowRight className="h-4 w-4 ml-2" />
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
      <section className="container mx-auto px-4 py-20 md:py-28">
        <div className="max-w-3xl">
          <Badge variant="outline" className="mb-6">
            <Sparkles className="h-3 w-3 mr-1.5" />
            AI-driven growth station
          </Badge>
          <h1 className="font-serif text-5xl md:text-6xl leading-tight mb-6">
            SEO och CRO på ett ställe — från första idé till skalad intäkt.
          </h1>
          <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
            Slay Station är growth-stationen för byråer och in-house team som vill bygga sajter
            som rankar och konverterar. Sökordsanalys, sajtarkitektur, performance-tracking
            och intäktsmodellering — i en plattform.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to={user ? "/clients" : "/auth"}>
              <Button size="lg">
                {user ? "Öppna workspace" : "Kom igång"}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
            <Link to="/docs">
              <Button size="lg" variant="outline">
                <BookOpen className="h-4 w-4 mr-2" />
                Läs dokumentationen
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-16 border-t border-border">
        <div className="max-w-2xl mb-12">
          <h2 className="font-serif text-3xl md:text-4xl mb-4">Allt du behöver för att äga organisk tillväxt</h2>
          <p className="text-muted-foreground">
            Sex moduler som arbetar ihop. Allt knutet till samma kund-workspace, samma data, samma mål.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <Card key={f.title}>
                <CardHeader>
                  <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center mb-2">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg">{f.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Flow */}
      <section className="container mx-auto px-4 py-16 border-t border-border">
        <div className="max-w-2xl mb-12">
          <h2 className="font-serif text-3xl md:text-4xl mb-4">Så fungerar arbetsflödet</h2>
          <p className="text-muted-foreground">
            Från tom canvas till live-tracking på fyra steg. Inga kalkyler i Excel, inga lösa Notion-dokument.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-4">
          {flow.map((s) => (
            <div key={s.step} className="relative">
              <div className="text-5xl font-serif text-primary/20 mb-2">{s.step}</div>
              <h3 className="font-medium mb-2">{s.title}</h3>
              <p className="text-sm text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* For who */}
      <section className="container mx-auto px-4 py-16 border-t border-border">
        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader>
              <Target className="h-6 w-6 text-primary mb-2" />
              <CardTitle className="text-lg">Byråer</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Hantera flera kunder i separata workspaces. Vita-label rapporter och automatiska briefings.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Zap className="h-6 w-6 text-primary mb-2" />
              <CardTitle className="text-lg">Founders & in-house</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Bygg en ny sajt på data — inte gissningar. Pre-launch Blueprint ger dig sajtkartan innan ni börjar koda.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <ShieldCheck className="h-6 w-6 text-primary mb-2" />
              <CardTitle className="text-lg">SEO/CRO-konsulter</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Koppla impact till varje åtgärd. Visa kunden exakt vilken trafik och intäkt ditt arbete genererar.
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 py-20 border-t border-border">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-10 md:p-14 text-center">
            <h2 className="font-serif text-3xl md:text-4xl mb-4">Klar att börja?</h2>
            <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Skapa ditt första kund-workspace på under en minut. Eller läs dokumentationen först om
              du vill se hur allt hänger ihop.
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Link to={user ? "/clients" : "/auth"}>
                <Button size="lg">
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
          </CardContent>
        </Card>
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
