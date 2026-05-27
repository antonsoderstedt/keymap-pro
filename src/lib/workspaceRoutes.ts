// Single source of truth for workspace navigation.
// Sprint 3: google-ads-legacy borttagen; Ads-historik som situationsspecifik.

import {
  LayoutDashboard,
  Search,
  Database,
  ListChecks,
  Settings,
  BarChart3,
  Archive,
  History,
  Activity,
  FileText,
  Radar,
  type LucideIcon,
} from "lucide-react";


export type WorkspaceRoute = {
  /** Sub-path under /clients/:id. Empty string = index. */
  sub: string;
  label: string;
  icon: LucideIcon;
  /** Free-text keywords for fuzzy command-bar search. */
  keywords: string;
  /** True = surfaced in primary sidebar. */
  primary: boolean;
  /** True = situational/advanced surface, only reachable via command bar. */
  legacy?: boolean;
  /** React Router `end` flag for NavLink active matching. */
  end?: boolean;
};

export const WORKSPACE_ROUTES: WorkspaceRoute[] = [
  { sub: "",                     label: "Idag",                icon: LayoutDashboard, keywords: "today start hem dashboard idag", primary: true, end: true },
  { sub: "keyword-research",     label: "Keyword Research",    icon: Search,          keywords: "keyword research studio planner dataforseo semrush ga4 gsc", primary: true },
  { sub: "reports",              label: "Rapporter",           icon: FileText,        keywords: "reports rapporter audit export pdf csv pptx artifacts", primary: true },
  { sub: "raw-data",             label: "Källdata",            icon: Database,        keywords: "raw data kalldata rows tabell export drilldown", primary: true },
  { sub: "dataforseo",           label: "DataForSEO",          icon: Search,          keywords: "dataforseo keyword lookup volume cpc kd serp trend", primary: true },
  { sub: "semrush",              label: "Semrush",             icon: Radar,           keywords: "semrush keyword gap competitors visibility top pages", primary: true },
  { sub: "actions",              label: "Åtgärder",            icon: ListChecks,      keywords: "actions pipeline queue todo förslag åtgärder audit", primary: true },
  { sub: "account-intelligence", label: "Account Intelligence", icon: Activity,        keywords: "account intelligence health kampanj jämförelse timeline ändringar översikt", primary: true },
  { sub: "performance",          label: "Performance",         icon: BarChart3,       keywords: "performance kpi seo ads ga4 trafik auction kampanj", primary: true },
  { sub: "keywords",             label: "Sökord",              icon: Search,          keywords: "keywords sökord universe segment", primary: true },
  { sub: "settings",             label: "Inställningar",       icon: Settings,        keywords: "settings källor data sources brand", primary: true },


  // Situationsspecifikt — endast via command bar
  { sub: "ads-history",     label: "Ads-historik",      icon: History, keywords: "ads historik mutations audit trail revert", primary: false, legacy: true },
  { sub: "prelaunch",       label: "Pre-launch",        icon: Archive, keywords: "prelaunch blueprint brief lansering situationsspecifikt", primary: false, legacy: true },
];

export function pathForRoute(workspaceId: string, sub: string): string {
  return sub ? `/clients/${workspaceId}/${sub}` : `/clients/${workspaceId}`;
}

export const PRIMARY_ROUTES = WORKSPACE_ROUTES.filter((r) => r.primary);
export const LEGACY_ROUTES = WORKSPACE_ROUTES.filter((r) => r.legacy);
