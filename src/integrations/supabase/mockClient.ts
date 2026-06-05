import type { BrandFonts, BrandPalette } from "@/hooks/useBrandKit";

type Filter = {
  kind: "eq" | "in" | "is" | "not";
  column: string;
  value: unknown;
  op?: string;
};

type MockRow = Record<string, any>;

const projectId = "11111111-1111-1111-1111-111111111111";
const now = new Date().toISOString();

const palette: BrandPalette = {
  primary: "#1E2761",
  secondary: "#CADCFC",
  accent: "#F96167",
  success: "#10B981",
  warning: "#F59E0B",
  neutral_bg: "#FFFFFF",
  neutral_fg: "#0F172A",
};

const fonts: BrandFonts = {
  heading: "Playfair Display",
  body: "Inter",
};

const mockProject = {
  id: projectId,
  user_id: "demo-user",
  name: "Nordic Growth AB",
  company: "Nordic Growth AB",
  domain: "nordicgrowth.se",
  market: "se-sv",
  products: "SEO, Google Ads, CRO",
  known_segments: "B2B SaaS, e-handel",
  competitors: "Competitor One, Competitor Two",
  description: "Mock workspace för screen inventory",
  created_at: now,
  last_active_at: now,
  is_archived: false,
};

const mockUniverse = {
  scale: "broad",
  generatedAt: now,
  totalKeywords: 12,
  totalEnriched: 10,
  cities: ["Stockholm", "Göteborg"],
  keywords: [
    { keyword: "seo byrå stockholm", cluster: "SEO-byrå", dimension: "location", intent: "commercial", funnelStage: "consideration", priority: "high", channel: "SEO", recommendedLandingPage: "/seo/byra-stockholm", searchVolume: 880, cpc: 24.5, competition: 0.7, dataSource: "real", kd: 32, serpFeatures: ["Local pack"], topRankingDomains: ["competitor-one.se"], competitorGap: true },
    { keyword: "google ads byrå", cluster: "Ads", dimension: "tjanst", intent: "commercial", funnelStage: "consideration", priority: "high", channel: "Google Ads", recommendedAdGroup: "ads_byrå", searchVolume: 720, cpc: 31.2, competition: 0.66, dataSource: "real", kd: 28, serpFeatures: ["Ads"], topRankingDomains: ["competitor-two.se"], competitorGap: true },
    { keyword: "keyword research", cluster: "Research", dimension: "use_case", intent: "informational", funnelStage: "awareness", priority: "medium", channel: "Content", contentIdea: "Guide om research-process", searchVolume: 260, cpc: 9.1, competition: 0.38, dataSource: "estimated", kd: 21, serpFeatures: ["People also ask"], topRankingDomains: ["blog.example"], competitorGap: false },
    { keyword: "negativt sökord exempel", cluster: "Negatives", dimension: "problem", intent: "navigational", funnelStage: "awareness", priority: "skip", channel: "Google Ads", isNegative: true, searchVolume: 120, cpc: 2.1, competition: 0.2, dataSource: "estimated", kd: 5, serpFeatures: [], topRankingDomains: [], competitorGap: false },
  ],
  opportunities: [
    { type: "quick_dominance", title: "Snabb dominans", description: "Sökord med tydlig intent och låg KD.", keywords: ["seo byrå stockholm"], priority: "high" },
  ],
  engineVersion: "screenshot-mock",
};

const mockAnalysis = {
  id: "analysis-mock",
  project_id: projectId,
  options: {
    segmentAnalysis: true,
    keywordClusters: true,
    expansion: true,
    adsStructure: true,
    quickWins: true,
    webscan: false,
    keywordResearch: true,
    keywordUniverse: true,
    universeScale: "broad",
  },
  result_json: {
    summary: "Mockanalys för screenshots.",
    totalKeywords: 1240,
    segments: [
      { name: "SaaS", sniCode: "62", size: 18, isNew: false, opportunityScore: 86, howTheySearch: ["seo byrå", "google ads byrå"], languagePatterns: ["leadgen", "trial"], useCases: ["Lead generation"], primaryKeywords: [{ keyword: "seo byrå stockholm", channel: "SEO", volumeEstimate: "500+", difficulty: "Medel", cpc: "24", intent: "Köp" }], insight: "Tydlig intent och stark monetisering." },
      { name: "E-handel", sniCode: "47", size: 12, isNew: true, opportunityScore: 77, howTheySearch: ["kampanjoptimering"], languagePatterns: ["ROAS", "marginal"], useCases: ["Scaling"], primaryKeywords: [{ keyword: "google ads byrå", channel: "Ads", volumeEstimate: "500+", difficulty: "Medel", cpc: "31", intent: "Köp" }], insight: "Hög konverteringspotential." },
    ],
    keywords: [
      { cluster: "SEO-byrå", segment: "SaaS" },
      { cluster: "Ads", segment: "E-handel" },
    ],
    expansion: [],
    adsStructure: [],
    quickWins: [
      { keyword: "seo byrå stockholm", action: "Skapa lokal landningssida", why: "Hög intent + tydlig geografi." },
    ],
    keywordResearch: [
      {
        cluster: "SEO-byrå",
        segment: "SaaS",
        recommendedH1: "SEO-byrå i Stockholm",
        metaDescription: "Mätbar SEO för tillväxtbolag.",
        urlSlug: "/seo-byra-stockholm",
        keywords: [
          { keyword: "seo byrå stockholm", category: "Tjänst", channel: "Båda", volume: "500-2000", cpc: "Hög", intent: "Köp", usage: "Landningssida", realVolume: 880, realCpc: 24, competition: 0.7, dataSource: "real" },
        ],
      },
    ],
  },
  scan_data_json: [],
  created_at: now,
  keyword_universe_json: mockUniverse,
  universe_scale: "broad",
};

const mockArtifacts = [
  { id: "art-1", project_id: projectId, name: "Weekly Briefing", description: "Veckorapport", created_at: now, payload: { report_type: "weekly_briefing", sections: { summary: "Allt ser stabilt ut" } } },
  { id: "art-2", project_id: projectId, name: "Audit PDF", description: "Rapportpreview", created_at: now, payload: { report_type: "ads_audit", sections: { scope: "Mock" }, issues: [{ title: "RSA saknar variation" }] } },
];

const mockRows: Record<string, MockRow[]> = {
  projects: [mockProject],
  analyses: [mockAnalysis],
  action_items: [
    { id: "act-1", project_id: projectId, title: "Skär ned lågkvalitativ traffic", description: "Exkludera irrelevanta sökningar.", category: "ads", priority: "high", status: "todo", source_type: "ads_wasted", source_id: "source-1", source_payload: { campaign_id: "123", negative_keywords: ["gratis", "jobb"] }, expected_impact: "Minska spill", expected_impact_sek: 18000, baseline_metrics: {}, metadata: {}, implemented_at: null, implementation_notes: null, due_date: null, notes: {}, created_at: now, updated_at: now },
    { id: "act-2", project_id: projectId, title: "Publicera landningssida för SEO-byrå", description: "Bygg sida för hög intent.", category: "seo", priority: "medium", status: "in_progress", source_type: "content", source_id: "source-2", source_payload: {}, expected_impact: "Fler leads", expected_impact_sek: 12000, baseline_metrics: {}, metadata: {}, implemented_at: null, implementation_notes: null, due_date: null, notes: {}, created_at: now, updated_at: now },
  ],
  decision_context: [{ project_id: projectId, action_item_id: "act-1", confidence: { value: 0.82, gate_triggers: [] }, created_at: now }],
  data_source_status: [
    { project_id: projectId, source: "ga4", status: "ok", reason: null, scope_ok: true, token_expired: false, selection: { id: "ga4-1", name: "GA4 Demo", label: "GA4 Demo" }, last_synced_at: now, last_error: null, ttl_seconds: 86400, age_seconds: 120 },
    { project_id: projectId, source: "gsc", status: "stale", reason: "Saknar ny sync", scope_ok: true, token_expired: false, selection: { id: "gsc-1", name: "GSC Demo", label: "GSC Demo" }, last_synced_at: now, last_error: null, ttl_seconds: 86400, age_seconds: 7200 },
    { project_id: projectId, source: "ads", status: "ok", reason: null, scope_ok: true, token_expired: false, selection: { id: "ads-1", name: "Google Ads Demo", label: "Google Ads Demo" }, last_synced_at: now, last_error: null, ttl_seconds: 86400, age_seconds: 800 },
    { project_id: projectId, source: "keyword_planner", status: "ok", reason: null, scope_ok: true, token_expired: false, selection: { id: "kp-1", name: "Keyword Planner", label: "Keyword Planner" }, last_synced_at: now, last_error: null, ttl_seconds: 86400, age_seconds: 300 },
  ],
  ads_change_proposals: [
    { id: "prop-1", project_id: projectId, title: "Pause broad match brand term", description: "Stop broad match leakage.", source_payload: { campaign_name: "Brand", ad_group_name: "Brand" }, status: "proposed", confidence: 0.86, expected_impact_sek: 9000, created_at: now },
    { id: "prop-2", project_id: projectId, title: "Add negatives", description: "Exclude irrelevant terms.", source_payload: { campaign_name: "Generic" }, status: "queued", confidence: 0.64, expected_impact_sek: 6000, created_at: now },
  ],
  ads_recommendation_outcomes: [
    { proposal_id: "prop-1", auto_reverted_at: null, auto_revert_reason: null },
  ],
  workspace_artifacts: mockArtifacts,
  kpi_targets: [
    { id: "kpi-1", project_id: projectId, metric: "organic_clicks", label: "Organiska klick", target_value: 5000, direction: "increase", timeframe: "month", channel: null, is_active: true, created_at: now },
  ],
  project_google_settings: [{ project_id: projectId, ads_customer_id: "123-456-7890", ads_customer_name: "Nordic Growth Ads" }],
  brand_kits: [{ id: "brand-1", project_id: projectId, logo_url: null, logo_dark_url: null, icon_url: null, palette, fonts, tone: "professional", voice_guidelines: "Clear, confident and practical.", image_style: "Clean product visuals", layout_template: "default", updated_at: now }],
  semrush_metrics: [
    { keyword: "seo byrå stockholm", kd: 32, updated_at: now, serp_features: ["Local pack"], top_domains: ["competitor-one.se"], competitors: ["competitor-one.se", "competitor-two.se"], created_at: now, keyword_universe_json: mockUniverse },
  ],
  keyword_metrics: [
    { keyword: "seo byrå stockholm", search_volume: 880, cpc_sek: 24.5, competition: 0.7, updated_at: now },
    { keyword: "google ads byrå", search_volume: 720, cpc_sek: 31.2, competition: 0.66, updated_at: now },
  ],
  keyword_serp_cache: [
    { keyword: "seo byrå stockholm", result_json: { features: ["Local pack"] }, fetched_at: now },
  ],
  keyword_planner_ideas: [
    { id: "kpidea-1", project_id: projectId, run_id: "run-1", seed_keyword: "seo byrå", seed_url: null, keyword: "seo byrå stockholm", language_code: "sv", location_code: "SE", avg_monthly_searches: 880, competition: "HIGH", competition_index: 67, low_top_of_page_bid_micros: 12000000, high_top_of_page_bid_micros: 24000000, fetched_at: now, created_at: now },
    { id: "kpidea-2", project_id: projectId, run_id: "run-1", seed_keyword: "google ads", seed_url: null, keyword: "google ads byrå", language_code: "sv", location_code: "SE", avg_monthly_searches: 720, competition: "HIGH", competition_index: 71, low_top_of_page_bid_micros: 15000000, high_top_of_page_bid_micros: 28000000, fetched_at: now, created_at: now },
  ],
  gsc_snapshots: [
    { id: "gsc-1", project_id: projectId, created_at: now, rows: [{ query: "seo byrå stockholm", clicks: 128, impressions: 2410 }] },
  ],
  ga4_snapshots: [
    { id: "ga4-1", project_id: projectId, created_at: now, rows: [{ page_path: "/", sessions: 910, conversions: 34 }] },
  ],
  project_goals: [
    { project_id: projectId, conversion_rate_pct: 3.4, conversion_value: 125000, currency: "SEK" },
  ],
  ads_mutations: [
    { id: "mut-1", project_id: projectId, action_type: "pause_keyword", status: "done", created_at: now, payload: { keyword: "gratis" } },
  ],
  ads_audits: [
    { id: "audit-1", project_id: projectId, status: "done", created_at: now, payload: { summary: "Brand terms look stable" } },
  ],
  auction_insights_snapshots: [
    { id: "auc-1", project_id: projectId, created_at: now, rows: [{ campaign_name: "Brand", impression_share: 0.72 }] },
  ],
  prelaunch_briefs: [
    { id: "brief-1", project_id: projectId, created_at: now, updated_at: now, title: "Nordic Growth AB", brief: { company: "Nordic Growth AB", market: "SE", audience: "B2B SaaS", goals: ["Leads"] }, markdown: "## Brief\nMock" },
  ],
  prelaunch_blueprints: [
    { id: "blue-1", project_id: projectId, created_at: now, updated_at: now, payload: { sitemap: ["/", "/tjanster", "/case"], markets: ["SE"] } },
  ],
  share_of_voice_snapshots: [
    { id: "sov-1", project_id: projectId, created_at: now, visibility: 0.42 },
  ],
};

const mockSession = {
  access_token: "mock-access-token",
  refresh_token: "mock-refresh-token",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  expires_in: 3600,
  user: {
    id: "demo-user",
    email: "demo@example.com",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    role: "authenticated",
    created_at: now,
    updated_at: now,
  },
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function matches(row: MockRow, filters: Filter[]) {
  return filters.every((filter) => {
    const value = row[filter.column];
    if (filter.kind === "eq") return value === filter.value;
    if (filter.kind === "in" && Array.isArray(filter.value)) return (filter.value as any[]).includes(value);
    if (filter.kind === "is") return filter.value === null ? value === null || value === undefined : value === filter.value;
    if (filter.kind === "not") return filter.op === "is" && filter.value === null ? value !== null && value !== undefined : value !== filter.value;
    return true;
  });
}

function applyOrder(rows: MockRow[], orders: Array<{ column: string; ascending: boolean }>) {
  return [...rows].sort((a, b) => {
    for (const order of orders) {
      const av = a[order.column];
      const bv = b[order.column];
      if (av === bv) continue;
      if (av == null) return order.ascending ? 1 : -1;
      if (bv == null) return order.ascending ? -1 : 1;
      if (av < bv) return order.ascending ? -1 : 1;
      if (av > bv) return order.ascending ? 1 : -1;
    }
    return 0;
  });
}

function rowsFor(table: string) {
  return clone(mockRows[table] ?? []);
}

class MockQuery {
  private filters: Filter[] = [];
  private orders: Array<{ column: string; ascending: boolean }> = [];
  private limitCount: number | null = null;
  private writeOp: null | { kind: "insert" | "update" | "delete" | "upsert"; payload: any } = null;

  constructor(private table: string) {}

  select() { return this; }
  eq(column: string, value: unknown) { this.filters.push({ kind: "eq", column, value }); return this; }
  neq(_column: string, _value: unknown) { return this; }
  gt(_column: string, _value: unknown) { return this; }
  gte(_column: string, _value: unknown) { return this; }
  lt(_column: string, _value: unknown) { return this; }
  lte(_column: string, _value: unknown) { return this; }
  like(_column: string, _value: unknown) { return this; }
  ilike(_column: string, _value: unknown) { return this; }
  contains(_column: string, _value: unknown) { return this; }
  containedBy(_column: string, _value: unknown) { return this; }
  overlaps(_column: string, _value: unknown) { return this; }
  match(_query: Record<string, unknown>) { return this; }
  or(_filter: string) { return this; }
  filter(_column: string, _op: string, _value: unknown) { return this; }
  range(_from: number, _to: number) { return this; }
  returns<_T = unknown>() { return this; }
  abortSignal(_signal: AbortSignal) { return this; }
  in(column: string, value: unknown[]) { this.filters.push({ kind: "in", column, value }); return this; }
  is(column: string, value: unknown) { this.filters.push({ kind: "is", column, value }); return this; }
  not(column: string, op: string, value: unknown) { this.filters.push({ kind: "not", column, value, op }); return this; }
  order(column: string, options?: { ascending?: boolean }) { this.orders.push({ column, ascending: options?.ascending ?? true }); return this; }
  limit(count: number) { this.limitCount = count; return this; }

  insert(payload: any) { this.writeOp = { kind: "insert", payload }; return this; }
  update(payload: any) { this.writeOp = { kind: "update", payload }; return this; }
  delete() { this.writeOp = { kind: "delete", payload: null }; return this; }
  upsert(payload: any) { this.writeOp = { kind: "upsert", payload }; return this; }

  maybeSingle() { return Promise.resolve(this.executeSingle(false)); }
  single() { return Promise.resolve(this.executeSingle(true)); }

  private executeSingle(strict: boolean) {
    const rows = this.executeRows();
    const data = rows[0] ?? null;
    if (strict && !data) return { data: null, error: null };
    return { data, error: null };
  }

  private executeRows() {
    const source = rowsFor(this.table).filter((row) => matches(row, this.filters));
    const ordered = this.orders.length ? applyOrder(source, this.orders) : source;
    return this.limitCount != null ? ordered.slice(0, this.limitCount) : ordered;
  }

  private executeWrite() {
    if (!this.writeOp) return { data: this.executeRows(), error: null };
    const rows = rowsFor(this.table);
    let nextRows = rows;
    let data: any = null;
    if (this.writeOp.kind === "insert") {
      const payloads = Array.isArray(this.writeOp.payload) ? this.writeOp.payload : [this.writeOp.payload];
      const inserted = payloads.map((row) => ({ id: row.id ?? `${this.table}-${Date.now()}`, created_at: row.created_at ?? now, updated_at: row.updated_at ?? now, ...row }));
      nextRows = rows.concat(inserted);
      data = inserted.length === 1 ? inserted[0] : inserted;
    } else if (this.writeOp.kind === "update") {
      const patch = this.writeOp.payload ?? {};
      nextRows = rows.map((row) => (matches(row, this.filters) ? { ...row, ...patch, updated_at: now } : row));
      const updated = nextRows.filter((row) => matches(row, this.filters));
      data = updated.length === 1 ? updated[0] : updated;
    } else if (this.writeOp.kind === "delete") {
      const removed = rows.filter((row) => matches(row, this.filters));
      nextRows = rows.filter((row) => !matches(row, this.filters));
      data = removed.length === 1 ? removed[0] : removed;
    } else if (this.writeOp.kind === "upsert") {
      const payloads = Array.isArray(this.writeOp.payload) ? this.writeOp.payload : [this.writeOp.payload];
      nextRows = rows.slice();
      for (const patch of payloads) {
        const idx = nextRows.findIndex((row) => row.id && patch.id && row.id === patch.id);
        const merged = { id: patch.id ?? `${this.table}-${Date.now()}`, created_at: patch.created_at ?? now, updated_at: now, ...patch };
        if (idx >= 0) nextRows[idx] = { ...nextRows[idx], ...merged };
        else nextRows.push(merged);
      }
      data = payloads.length === 1 ? payloads[0] : payloads;
    }
    mockRows[this.table] = nextRows;
    return { data, error: null };
  }

  then(resolve: (value: any) => any, reject?: (reason: any) => any) {
    try {
      const result = this.writeOp ? this.executeWrite() : { data: this.executeRows(), error: null };
      return Promise.resolve(result).then(resolve, reject);
    } catch (error) {
      return Promise.reject(error).then(resolve, reject);
    }
  }
}

function createQuery(table: string) {
  return new MockQuery(table);
}

const mockStorage = {
  from(bucket: string) {
    return {
      async upload(path: string, _file: File | Blob, _options?: Record<string, unknown>) {
        return { data: { path }, error: null };
      },
      list: async () => ({ data: [], error: null }),
      remove: async () => ({ data: null, error: null }),
      getPublicUrl(path: string) {
        return { data: { publicUrl: `https://example.com/${bucket}/${path}` } };
      },
    };
  },
};

const mockFunctions = {
  async invoke(name: string, _options?: Record<string, unknown>) {
    if (name === "data-sources-status") {
      return { data: { generated_at: now, google_connected: true, token_scope: "mock", sources: mockRows.data_source_status }, error: null };
    }
    if (name === "keyword-universe") return { data: { universe: mockUniverse }, error: null };
    if (name === "generate-presentation") return { data: { file: btoa("mock-presentation") }, error: null };
    if (name === "generate-report") return { data: { report: { title: "Mock report" } }, error: null };
    if (name === "brand-kit-extract") return { data: { palette, fonts, tone: "professional", voice_guidelines: "Clear and confident.", image_style: "Clean product visuals" }, error: null };
    if (name === "ads-fetch-account-tree") return { data: { campaigns: [{ name: "Brand", impressions: 12000, clicks: 840 }] }, error: null };
    if (name === "ads-import-auction-csv" || name === "ads-fetch-auction-insights") return { data: { rows: [{ campaign_name: "Brand", impression_share: 0.72 }] }, error: null };
    if (name.startsWith("ads-") || name.startsWith("prelaunch-") || name === "analyse" || name === "scb-company-profile") {
      return { data: { ok: true, name, project_id: projectId, universe: mockUniverse, result_json: mockAnalysis.result_json }, error: null };
    }
    return { data: { ok: true, name }, error: null };
  },
};

const mockAuth = {
  onAuthStateChange(callback: (event: string, session: any) => void) {
    queueMicrotask(() => callback("SIGNED_IN", mockSession));
    return { data: { subscription: { unsubscribe() {} } } };
  },
  async getSession() {
    return { data: { session: mockSession }, error: null };
  },
  async signOut() {
    return { error: null };
  },
  async signInWithPassword(_creds: { email: string; password: string }) {
    return { data: { session: mockSession, user: mockSession.user }, error: null };
  },
  async signUp(_creds: { email: string; password: string; options?: Record<string, unknown> }) {
    return { data: { session: mockSession, user: mockSession.user }, error: null };
  },
  async signInWithOAuth(_opts: Record<string, unknown>) {
    return { data: { url: "", provider: "google" }, error: null };
  },
  async resetPasswordForEmail(_email: string, _opts?: Record<string, unknown>) {
    return { data: {}, error: null };
  },
  async updateUser(_attrs: Record<string, unknown>) {
    return { data: { user: mockSession.user }, error: null };
  },
  async getUser() {
    return { data: { user: mockSession.user }, error: null };
  },
};

export function createScreenshotMockClient() {
  return {
    auth: mockAuth,
    storage: mockStorage,
    functions: mockFunctions,
    from(table: string) {
      return createQuery(table);
    },
    channel(_name?: string, _opts?: Record<string, unknown>) {
      const ch: any = {
        on(_event: any, _filter?: any, _cb?: any) { return ch; },
        subscribe(_cb?: any) { return ch; },
        send(_msg: any) { return Promise.resolve("ok" as const); },
        unsubscribe() { return Promise.resolve("ok" as const); },
      };
      return ch;
    },
    removeChannel() {
      return null;
    },
  };
}