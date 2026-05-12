// "Så fungerar Slay Station" — pedagogisk guide som binder ihop hela appen.
// Hittas via sidomenyn under Inställningar.

import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, Database, Brain, Target, Clock, RefreshCw, Zap, BookOpen } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FlowDiagram } from "@/components/howitworks/FlowDiagram";
import { StepTimeline } from "@/components/howitworks/StepTimeline";
import { DataMatrix } from "@/components/howitworks/DataMatrix";
import { CrossPollinationCards } from "@/components/howitworks/CrossPollinationCards";
import { ProjectStatusChecklist } from "@/components/howitworks/ProjectStatusChecklist";
import heroImg from "@/assets/howitworks/hero.jpg";

const FAQ = [
  { q: "Måste jag köra Ultra först innan jag använder Google Ads-fliken?", a: "Nej. Ads-motorn fungerar utan universum — den läser Google Ads + GA4. Men med universum får du brand-termer, negativ-kandidater och cluster-intent som gör Ads-rekommendationerna betydligt vassare." },
  { q: "Vad händer om en datakälla blir inaktuell?", a: "Du får en varning högst upp i layouten med en 'Koppla om'-knapp. Auto-sync försöker även hämta nytt vid varje sidöppning och i schemalagda intervall." },
  { q: "Hur räknas estimated_value_sek?", a: "GA4 ger faktiskt konverteringsvärde (eller en proxy från ditt mål-värde). Diagnoserna multiplicerar potentiell trafik × konverteringsgrad × värde — och drar bort kostnad där det är relevant. Utan GA4 gissar systemet." },
  { q: "Kan jag köra Ads och SEO helt separat?", a: "Ja. Båda motorerna är fristående. Korsbefruktningen (universum → Ads, Ads → SEO) är en bonus när båda finns." },
  { q: "Hur ofta hämtas ny data?", a: "GA4/GSC/Ads: vid sidöppning + schemalagt intervall. Diagnoser: räknas om när underliggande snapshot ändras (cache-träffar visas i meta). Universum: körs på begäran (Lite/Max/Ultra)." },
  { q: "Vad ska jag göra först?", a: "1) Projekt + mål + brand-termer. 2) Koppla GA4, GSC, Ads. 3) Kör Ultra en gång. 4) Öppna SEO-dashboard och Ads Audit. 5) Följ Veckobriefingen." },
];

const TERMINOLOGY = [
  { term: "Snapshot", def: "En cachad ögonblicksbild av rådata för snabb återanvändning." },
  { term: "Diagnostik", def: "Regelmotorn som omvandlar snapshot → konkreta möjligheter med värde i SEK." },
  { term: "Kluster", def: "Grupp av sökord runt samma intention — basenheten i SEO-arbetet." },
  { term: "Intent", def: "Vad användaren faktiskt vill: informational, navigational, commercial, transactional." },
  { term: "Universum", def: "Hela kartan av relevanta sökord för nischen, berikade med volym & SERP-data." },
];

export default function HowItWorks() {
  const { id } = useParams<{ id: string }>();
  const workspaceId = id!;

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-8 space-y-12">
      {/* HERO */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-2xl border border-border bg-card/40"
      >
        <div className="absolute inset-0 opacity-30">
          <img src={heroImg} alt="" width={1536} height={768} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-transparent" />
        </div>
        <div className="relative p-8 lg:p-12 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-primary/40 bg-primary/10 text-[11px] font-mono uppercase tracking-wider text-primary mb-5">
            <BookOpen className="h-3 w-3" /> Guide
          </div>
          <h1 className="font-serif text-4xl lg:text-5xl leading-[1.05] mb-4">
            Så fungerar <span className="text-primary">Slay Station</span>
          </h1>
          <p className="text-base lg:text-lg text-muted-foreground leading-relaxed mb-5">
            En 5-minuters genomgång av hur projektmål, datakällor, sökordsuniversum och AI-motorerna binds ihop till konkreta åtgärder med värde i SEK.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-muted-foreground">
            <span className="px-2 py-1 rounded border border-border bg-background/60">5 min läsning</span>
            <span className="px-2 py-1 rounded border border-border bg-background/60">Uppdaterad löpande</span>
            <span className="px-2 py-1 rounded border border-border bg-background/60">Pedagogiskt format</span>
          </div>
        </div>
      </motion.section>

      {/* ÖVERSIKT 30s */}
      <section>
        <div className="mb-5">
          <div className="text-[11px] font-mono uppercase tracking-wider text-primary mb-1">Översikt — 30 sekunder</div>
          <h2 className="font-serif text-2xl">Tre faser, en loop</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-3 items-stretch">
          {[
            { icon: Database, title: "Samla data", body: "GA4, Search Console, Google Ads och sökordsuniversum landar i datalagret." },
            { icon: Brain, title: "Förstå", body: "SEO- och Ads-motorerna räknar fram möjligheter, vägda i SEK efter dina mål." },
            { icon: Target, title: "Agera", body: "Veckobriefing prioriterar topp-åtgärder. Action Tracker mäter effekten." },
          ].map((c, i, arr) => {
            const Icon = c.icon;
            return (
              <div key={i} className="relative">
                <div className="rounded-xl border border-border bg-card/40 p-5 h-full">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/40 flex items-center justify-center">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground">FAS {i + 1}</span>
                  </div>
                  <h3 className="font-serif text-lg mb-1">{c.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{c.body}</p>
                </div>
                {i < arr.length - 1 && (
                  <div className="hidden md:flex absolute top-1/2 -right-2 -translate-y-1/2 z-10 h-7 w-7 items-center justify-center rounded-full bg-background border border-primary/40">
                    <span className="text-primary text-sm">→</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* FLOW DIAGRAM */}
      <section>
        <FlowDiagram />
      </section>

      {/* STEG FÖR STEG */}
      <section>
        <div className="mb-5">
          <div className="text-[11px] font-mono uppercase tracking-wider text-primary mb-1">Onboarding</div>
          <h2 className="font-serif text-2xl">Steg för steg — från noll till första åtgärd</h2>
        </div>
        <StepTimeline workspaceId={workspaceId} />
      </section>

      {/* DATAMATRIX */}
      <section>
        <DataMatrix />
      </section>

      {/* KORSBEFRUKTNING */}
      <section>
        <div className="mb-5">
          <div className="text-[11px] font-mono uppercase tracking-wider text-primary mb-1">Korsbefruktning</div>
          <h2 className="font-serif text-2xl">När data från en del förbättrar en annan</h2>
        </div>
        <CrossPollinationCards />
      </section>

      {/* AUTO-UPPDATERING */}
      <section>
        <div className="mb-5">
          <div className="text-[11px] font-mono uppercase tracking-wider text-primary mb-1">Färskhet</div>
          <h2 className="font-serif text-2xl">Vad uppdateras automatiskt?</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { icon: RefreshCw, title: "GA4 / GSC / Ads", interval: "Auto", body: "Hämtas vid sidöppning + schemalagt intervall. Stale-varning + 'Koppla om' om något fallerar." },
            { icon: Zap, title: "SEO/Ads-diagnoser", interval: "On change", body: "Räknas om när underliggande snapshot ändras. Cache-träffar visas i meta-info." },
            { icon: Sparkles, title: "Sökordsuniversum", interval: "Manuellt", body: "Körs på begäran (Lite/Max/Ultra). Berikning kan köras separat utan att regenerera allt." },
            { icon: Clock, title: "Action-effekt", interval: "Vid klart-markering", body: "measure-action-impact jämför metrik före/efter när du markerar en åtgärd som klar." },
          ].map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.title} className="rounded-xl border border-border bg-card/40 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="relative">
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{c.interval}</span>
                </div>
                <div className="font-medium text-sm mb-1">{c.title}</div>
                <p className="text-xs text-muted-foreground leading-relaxed">{c.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* PROJEKT-STATUS */}
      <section>
        <ProjectStatusChecklist workspaceId={workspaceId} />
      </section>

      {/* TERMINOLOGI */}
      <section>
        <div className="mb-5">
          <div className="text-[11px] font-mono uppercase tracking-wider text-primary mb-1">Ordlista</div>
          <h2 className="font-serif text-2xl">Snabbreferens — termer som används överallt</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {TERMINOLOGY.map((t) => (
            <div key={t.term} className="rounded-lg border border-border bg-card/30 p-4">
              <div className="font-mono text-xs text-primary mb-1">{t.term}</div>
              <div className="text-sm text-muted-foreground">{t.def}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section>
        <div className="mb-5">
          <div className="text-[11px] font-mono uppercase tracking-wider text-primary mb-1">FAQ</div>
          <h2 className="font-serif text-2xl">Vanliga frågor</h2>
        </div>
        <Accordion type="single" collapsible className="rounded-xl border border-border bg-card/30 px-4">
          {FAQ.map((f, i) => (
            <AccordionItem key={i} value={`f-${i}`} className="border-border">
              <AccordionTrigger className="text-left text-sm font-medium hover:no-underline">{f.q}</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground leading-relaxed">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </div>
  );
}
