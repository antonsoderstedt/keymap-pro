import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ArrowRight, Play, Save } from "lucide-react";
import StepContext from "@/components/wizard/StepContext";
import StepImport, { type CustomerRow } from "@/components/wizard/StepImport";
import StepAnalyse from "@/components/wizard/StepAnalyse";
import LoadingScreen from "@/components/wizard/LoadingScreen";
import type { Project, AnalysisOptions } from "@/lib/types";

const STEPS = ["Företagskontext", "Kunddata", "Analys"];

export default function ProjectWizard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [projectName, setProjectName] = useState("");
  const [company, setCompany] = useState("");
  const [domain, setDomain] = useState("");
  const [market, setMarket] = useState("se-sv");
  const [products, setProducts] = useState("");
  const [knownSegments, setKnownSegments] = useState("");
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [options, setOptions] = useState<AnalysisOptions>({
    segmentAnalysis: true,
    keywordClusters: true,
    expansion: true,
    adsStructure: true,
    quickWins: true,
    webscan: false,
  });
  const [analysing, setAnalysing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id) loadProject();
  }, [id]);

  const loadProject = async () => {
    const { data, error } = await supabase.from("projects").select("*").eq("id", id!).single();
    if (error || !data) return;
    const p = data as Project;
    setProjectName(p.name);
    setCompany(p.company);
    setDomain(p.domain || "");
    setMarket(p.market);
    setProducts(p.products || "");
    setKnownSegments(p.known_segments || "");

    const { data: custs } = await supabase.from("customers").select("*").eq("project_id", id!);
    if (custs && custs.length > 0) {
      setCustomers(custs.map((c: any) => ({
        name: c.name, industry: c.industry || "", sni: c.sni || "",
        domain: c.domain || "", revenue: c.revenue || "", frequency: c.frequency || "", products: c.products || "",
      })));
    }
  };

  const saveProject = async () => {
    setSaving(true);
    const { error } = await supabase.from("projects").update({
      name: projectName || company || "Namnlöst projekt",
      company, domain: domain || null, market,
      products: products || null, known_segments: knownSegments || null,
    }).eq("id", id!);

    if (error) {
      toast({ title: "Fel vid sparning", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    // Save customers
    await supabase.from("customers").delete().eq("project_id", id!);
    if (customers.length > 0) {
      const rows = customers.map((c) => ({
        project_id: id!,
        name: c.name, industry: c.industry || null, sni: c.sni || null,
        domain: c.domain || null, revenue: c.revenue || null,
        frequency: c.frequency || null, products: c.products || null,
      }));
      await supabase.from("customers").insert(rows);
    }

    toast({ title: "Sparat!" });
    setSaving(false);
  };

  const runAnalysis = async () => {
    await saveProject();
    setAnalysing(true);
    setProgress(0);
    setProgressMessage("Förbereder analys...");

    const messages = [
      "Läser in kunddata...",
      "Analyserar branschsegment...",
      "Identifierar branschspråk...",
      "Genererar keyword clusters...",
      "Bygger kampanjstruktur...",
      "Identifierar Quick Wins...",
      "Sammanställer resultat...",
    ];

    let p = 0;
    const interval = setInterval(() => {
      p += Math.random() * 8 + 2;
      if (p > 90) p = 90;
      setProgress(p);
      setProgressMessage(messages[Math.min(Math.floor(p / 14), messages.length - 1)]);
    }, 1500);

    try {
      const { data, error } = await supabase.functions.invoke("analyse", {
        body: { project_id: id, options },
      });

      clearInterval(interval);

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setProgress(100);
      setProgressMessage("Klart!");

      setTimeout(() => {
        navigate(`/project/${id}/results`);
      }, 500);
    } catch (error: any) {
      clearInterval(interval);
      setAnalysing(false);
      toast({ title: "Analysfel", description: error.message, variant: "destructive" });
    }
  };

  const canProceed = () => {
    if (step === 0) return company.trim() && products.trim();
    if (step === 1) return customers.length > 0;
    if (step === 2) return Object.values(options).some(Boolean);
    return false;
  };

  if (analysing) {
    return (
      <div className="min-h-screen bg-background px-6">
        <div className="mx-auto max-w-2xl">
          <LoadingScreen progress={progress} message={progressMessage} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Projektnamn..."
              className="w-48 border-0 bg-transparent text-lg font-serif focus-visible:ring-0"
            />
          </div>
          <Button variant="outline" size="sm" onClick={saveProject} disabled={saving} className="gap-2">
            <Save className="h-3 w-3" />
            {saving ? "Sparar..." : "Spara"}
          </Button>
        </div>
      </header>

      {/* Step indicator */}
      <div className="border-b border-border px-6 py-3">
        <div className="mx-auto flex max-w-4xl items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <button
                onClick={() => setStep(i)}
                className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs transition-colors ${
                  i === step
                    ? "bg-primary text-primary-foreground"
                    : i < step
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <span>{i + 1}</span>
                <span>{s}</span>
              </button>
              {i < STEPS.length - 1 && <div className="h-px w-8 bg-border" />}
            </div>
          ))}
        </div>
      </div>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {step === 0 && (
          <StepContext
            company={company} setCompany={setCompany}
            domain={domain} setDomain={setDomain}
            market={market} setMarket={setMarket}
            products={products} setProducts={setProducts}
            knownSegments={knownSegments} setKnownSegments={setKnownSegments}
          />
        )}
        {step === 1 && <StepImport customers={customers} setCustomers={setCustomers} />}
        {step === 2 && (
          <StepAnalyse
            options={options}
            setOptions={setOptions}
            hasDomainsForScan={customers.some((c) => c.domain)}
          />
        )}

        <div className="mt-8 flex items-center justify-between">
          <Button variant="outline" onClick={() => setStep(step - 1)} disabled={step === 0} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Tillbaka
          </Button>
          {step < 2 ? (
            <Button onClick={() => { saveProject(); setStep(step + 1); }} disabled={!canProceed()} className="gap-2">
              Nästa
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={runAnalysis} disabled={!canProceed()} className="gap-2">
              <Play className="h-4 w-4" />
              Kör analys
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
