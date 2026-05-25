// Single source of truth for workspace navigation.
// Sprint 3: google-ads-legacy borttagen; Ads-historik som situationsspecifik.

import {
  LayoutDashboard,
  Search,
  ListChecks,
  Settings,
  BarChart3,
  Archive,
  Sun,
  History,
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
  { sub: "",            label: "Idag",           icon: LayoutDashboard, keywords: "today start hem dashboard idag", primary: true, end: true },
  { sub: "actions",     label: "Åtgärder",       icon: ListChecks,      keywords: "actions pipeline queue todo förslag åtgärder audit", primary: true },
  { sub: "performance", label: "Performance",    icon: BarChart3,       keywords: "performance kpi seo ads ga4 trafik auction kampanj", primary: true },
  { sub: "keywords",    label: "Sökord",         icon: Search,          keywords: "keywords sökord universe segment", primary: true },
  { sub: "settings",    label: "Inställningar",  icon: Settings,        keywords: "settings källor data sources brand", primary: true },

  // Situationsspecifikt — endast via command bar
  { sub: "overview-legacy", label: "Översikt (legacy)", icon: Sun,     keywords: "overview executive legacy", primary: false, legacy: true },
  { sub: "ads-history",     label: "Ads-historik",      icon: History, keywords: "ads historik mutations audit trail revert", primary: false, legacy: true },
  { sub: "prelaunch",       label: "Pre-launch",        icon: Archive, keywords: "prelaunch blueprint brief lansering situationsspecifikt", primary: false, legacy: true },
];

export function pathForRoute(workspaceId: string, sub: string): string {
  return sub ? `/clients/${workspaceId}/${sub}` : `/clients/${workspaceId}`;
}

export const PRIMARY_ROUTES = WORKSPACE_ROUTES.filter((r) => r.primary);
export const LEGACY_ROUTES = WORKSPACE_ROUTES.filter((r) => r.legacy);
