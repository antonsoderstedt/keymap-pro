import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, BookOpen, Search } from "lucide-react";
import { DOCS, DOC_CATEGORIES, type DocSection } from "@/lib/docs";
import { useAuth } from "@/hooks/useAuth";

export default function Docs() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<DocSection["category"] | "Alla">("Alla");
  const [activeId, setActiveId] = useState<string>(DOCS[0].id);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DOCS.filter((d) => {
      const matchesCat = activeCategory === "Alla" || d.category === activeCategory;
      if (!matchesCat) return false;
      if (!q) return true;
      const hay = (
        d.title +
        " " +
        d.summary +
        " " +
        d.body.map((b) => `${b.heading || ""} ${b.text || ""} ${(b.bullets || []).join(" ")}`).join(" ")
      ).toLowerCase();
      return hay.includes(q);
    });
  }, [query, activeCategory]);

  const active = DOCS.find((d) => d.id === activeId) ?? filtered[0] ?? DOCS[0];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <Link to="/" className="font-serif text-2xl text-primary">Slay Station</Link>
          <nav className="flex items-center gap-2">
            <Link to="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Hem
              </Button>
            </Link>
            <Link to={user ? "/clients" : "/auth"}>
              <Button size="sm">{user ? "Mitt workspace" : "Logga in"}</Button>
            </Link>
          </nav>
        </div>
      </header>

      <div className="container mx-auto px-4 py-10">
        <div className="mb-10 max-w-2xl">
          <Badge variant="outline" className="mb-4">
            <BookOpen className="h-3 w-3 mr-1.5" />
            Knowledge base
          </Badge>
          <h1 className="font-serif text-4xl md:text-5xl mb-3">Dokumentation</h1>
          <p className="text-muted-foreground">
            Allt du behöver för att komma igång och få ut det mesta av Slay Station. Uppdateras vid varje release.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
          {/* Sidebar */}
          <aside className="space-y-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Sök i docs…"
                className="pl-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setActiveCategory("Alla")}
                className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                  activeCategory === "Alla"
                    ? "border-primary text-primary bg-primary/5"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                Alla
              </button>
              {DOC_CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setActiveCategory(c)}
                  className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                    activeCategory === c
                      ? "border-primary text-primary bg-primary/5"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            <nav className="space-y-1">
              {filtered.length === 0 && (
                <p className="text-xs text-muted-foreground px-2">Inga träffar.</p>
              )}
              {filtered.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setActiveId(d.id)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    active.id === d.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <div>{d.title}</div>
                  <div className="text-[10px] uppercase tracking-wide opacity-60 mt-0.5">{d.category}</div>
                </button>
              ))}
            </nav>
          </aside>

          {/* Content */}
          <main>
            <Card>
              <CardHeader>
                <Badge variant="outline" className="w-fit mb-2">{active.category}</Badge>
                <CardTitle className="font-serif text-3xl">{active.title}</CardTitle>
                <p className="text-muted-foreground mt-2">{active.summary}</p>
              </CardHeader>
              <CardContent className="space-y-6 prose-slay">
                {active.body.map((b, i) => (
                  <section key={i} className="space-y-3">
                    {b.heading && <h2 className="font-medium text-lg">{b.heading}</h2>}
                    {b.text && <p className="text-sm leading-relaxed text-muted-foreground">{b.text}</p>}
                    {b.bullets && (
                      <ul className="list-disc list-inside space-y-1.5 text-sm text-muted-foreground">
                        {b.bullets.map((bullet, j) => (
                          <li key={j}>{bullet}</li>
                        ))}
                      </ul>
                    )}
                  </section>
                ))}
              </CardContent>
            </Card>
          </main>
        </div>
      </div>
    </div>
  );
}
