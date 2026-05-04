// Workspace-typer (kundtyper) — definierar dimensioner, setup-fält och defaults
// per typ av verksamhet. Används av Pre-launch, Sökord och Goals.

export type WorkspaceType =
  | "b2b_manufacturer"
  | "d2c_brand"
  | "local_service"
  | "b2b_service"
  | "ecommerce";

export type ConversionType = "purchase" | "lead" | "booking" | "trial" | "store_visit";

export interface WorkspaceConfig {
  id: WorkspaceType;
  label: string;
  shortLabel: string;
  description: string;
  defaultDimensions: string[];
  setupFields: string[];
  defaultConversion: ConversionType;
  clusterPromptHint: string;
  briefHints: {
    business_idea?: string;
    target_audience?: string;
    usp?: string;
    locations?: string;
    competitors?: string;
  };
}

export const WORKSPACE_CONFIGS: Record<WorkspaceType, WorkspaceConfig> = {
  b2b_manufacturer: {
    id: "b2b_manufacturer",
    label: "B2B Tillverkare / Distributör",
    shortLabel: "B2B Tillverkare",
    description: "Industriell tillverkning, komponenter, distribution. Lång köpcykel, beslutsfattare på flera nivåer.",
    defaultDimensions: ["produkt", "material", "bransch", "kundsegment", "use_case", "kommersiell"],
    setupFields: ["sniCodes", "customerList", "productCatalog", "competitors"],
    defaultConversion: "lead",
    clusterPromptHint: "Klustra efter produktkategori × material × bransch (t.ex. 'kabelgenomföring plåt', 'DIN-skena rostfri').",
    briefHints: {
      business_idea: "Vad tillverkar/distribuerar ni? Vilka produktkategorier? Affärsmodell B2B?",
      target_audience: "Vilka branscher köper? Beslutsfattare (inköpare, projektledare, konstruktör)?",
      usp: "Material, certifieringar, leveranstider, lager, customization?",
      competitors: "Andra tillverkare/distributörer i Sverige eller Europa.",
    },
  },
  d2c_brand: {
    id: "d2c_brand",
    label: "D2C Varumärke",
    shortLabel: "D2C",
    description: "Konsumentvarumärken som säljer direkt online. Trender, livsstil, recensioner driver köp.",
    defaultDimensions: ["produkt", "livsstil_trend", "vs_jämförelse", "problem", "smak_variant", "konkurrent"],
    setupFields: ["brandPosition", "competitors", "productCategories", "targetAudience"],
    defaultConversion: "purchase",
    clusterPromptHint: "Klustra efter produktegenskap × köpintent × trend. Inkludera 'vs'-sökord och recension/test-sökord.",
    briefHints: {
      business_idea: "Vilka produkter? Vad är varumärket? Online-only eller hybrid?",
      target_audience: "Demografi, livsstil, värderingar, sociala kanaler?",
      usp: "Vad gör varumärket unikt? Innovation, värderingar, design, pris?",
      competitors: "Konkurrentvarumärken inom samma kategori.",
    },
  },
  local_service: {
    id: "local_service",
    label: "Lokal Tjänst",
    shortLabel: "Lokal tjänst",
    description: "Skönhetskliniker, restauranger, hantverkare, advokat — kunder bokar lokalt.",
    defaultDimensions: ["tjänst", "plats", "problem", "fråga", "pris"],
    setupFields: ["cities", "serviceAreas", "catchmentRadius", "googleBusinessId"],
    defaultConversion: "booking",
    clusterPromptHint: "Klustra ALLTID efter tjänst × stad. Inkludera 'nära mig'-varianter och 'pris [stad]'.",
    briefHints: {
      business_idea: "Vilka tjänster? Vilka städer eller upptagningsområden?",
      target_audience: "Lokal demografi, vilken typ av kund? Pris-segment?",
      usp: "Erfarenhet, certifieringar, garanti, snabbhet, pris?",
      locations: "Obligatoriskt — vilka städer/områden? T.ex. Norrtälje, Stockholm Östermalm.",
      competitors: "Andra lokala leverantörer i samma område.",
    },
  },
  b2b_service: {
    id: "b2b_service",
    label: "B2B Tjänst / SaaS",
    shortLabel: "B2B / SaaS",
    description: "Konsultbolag, byråer, mjukvara. Lead-nurturing, demos, trials.",
    defaultDimensions: ["use_case", "bransch_vertikal", "problem", "lösning", "konkurrent", "feature"],
    setupFields: ["services", "verticals", "competitors", "pricingModel"],
    defaultConversion: "lead",
    clusterPromptHint: "Klustra efter tjänst/feature × vertikal. Inkludera 'X alternativ', 'X vs Y' och feature-sökord.",
    briefHints: {
      business_idea: "Vilka tjänster eller mjukvara? Vilken affärsmodell (subscription, projekt)?",
      target_audience: "Vilka roller/branscher (CMO, IT-chef i e-handel)?",
      usp: "Plattform, expertis, snabbhet, integrationer, prismodell?",
      competitors: "Direkta konkurrenter och alternativa lösningar.",
    },
  },
  ecommerce: {
    id: "ecommerce",
    label: "E-handel",
    shortLabel: "E-handel",
    description: "Bred produktkatalog eller marketplace. Shopping-intent dominerar.",
    defaultDimensions: ["kategori", "attribut", "pris", "problem", "varumärke", "säsong"],
    setupFields: ["productCategories", "priceRange", "brands"],
    defaultConversion: "purchase",
    clusterPromptHint: "Klustra efter produktkategori × attribut × intent. Prioritera shopping-intent och 'köpa'-sökord.",
    briefHints: {
      business_idea: "Vilka produktkategorier? Egna produkter eller marketplace?",
      target_audience: "Bred B2C? Nisch? Pris-segment?",
      usp: "Sortiment, priser, leverans, returer, kundservice?",
      competitors: "Andra e-handlare i samma kategori.",
    },
  },
};

export function getWorkspaceConfig(type: string | null | undefined): WorkspaceConfig {
  if (!type || !(type in WORKSPACE_CONFIGS)) return WORKSPACE_CONFIGS.b2b_manufacturer;
  return WORKSPACE_CONFIGS[type as WorkspaceType];
}

export const WORKSPACE_TYPE_OPTIONS: Array<{ value: WorkspaceType; label: string; description: string }> = (
  Object.values(WORKSPACE_CONFIGS).map(c => ({
    value: c.id, label: c.label, description: c.description,
  }))
);
