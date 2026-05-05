import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";

const TERM_EXPLANATIONS: Record<string, string> = {
  CPC: "Cost Per Click — vad du betalar per klick i Google Ads.",
  CTR: "Click-Through Rate — andelen som klickar av de som ser annonsen/sidan. Hög CTR = bra relevans.",
  KD: "Keyword Difficulty (0-100) — hur svårt det är att ranka organiskt. Under 30 är relativt lätt.",
  SERP: "Search Engine Results Page — sidan med sökresultat som visas i Google.",
  Intent: "Sökintent — vad personen vill göra: köpa, lära sig, navigera eller jämföra.",
  Kluster: "En grupp relaterade sökord som hör till samma ämne eller landningssida.",
  CAC: "Customer Acquisition Cost — vad det kostar att skaffa en ny kund.",
  LTV: "Lifetime Value — totalt värde en kund ger under hela kundrelationen.",
  ROAS: "Return On Ad Spend — intäkt per reklamkrona. ROAS 4 = 4 kr intäkt per 1 kr spenderat.",
  AOV: "Average Order Value — genomsnittligt ordervärde per köp.",
  SOV: "Share of Voice — din andel av total sökordssynlighet i din nisch.",
  IS: "Impression Share — andel av möjliga visningar du faktiskt får i Google Ads.",
  "Quality Score": "Google Ads kvalitetspoäng (1-10). Påverkar CPC och annonsplacering.",
  "Topical Authority": "Hur starkt Google uppfattar din sajt som expert inom ett ämne.",
};

interface Props {
  term: string;
  className?: string;
}

export function Explain({ term, className }: Props) {
  const explanation = TERM_EXPLANATIONS[term];
  if (!explanation) return <span className={className}>{term}</span>;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-0.5 cursor-help border-b border-dotted border-muted-foreground/50 ${className ?? ""}`}
          >
            {term}
            <HelpCircle className="h-3 w-3 text-muted-foreground/60 shrink-0" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-64 text-xs">
          <p>
            <strong>{term}:</strong> {explanation}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
