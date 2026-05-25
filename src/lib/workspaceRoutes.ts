// Single source of truth for workspace navigation.
// Used by WorkspaceSidebar (primary only) and CommandBar (primary + legacy).
// Sprint 2 — Day 1: route registry consolidation.

import {
  LayoutDashboard,
  Search,
  ListChecks,
  Settings,
  BarChart3,
  Megaphone,
  Archive,
  Sun,
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
  /** True = legacy/archived surface, only reachable via command bar. */
  legacy?: boolean;
  /** React Router `end` flag for NavLink active matching. */
  end?: boolean;
};

export const WORKSPACE_ROUTES: WorkspaceRoute[] = [
  { sub: "",            label: "Idag",           icon: LayoutDashboard, keywords: "today start hem dashboard idag", primary: true, end: true },
  { sub: "actions",     label: "Åtgärder",       icon: ListChecks,      keywords: "actions pipeline queue todo förslag åtgärder", primary: true },
  { sub: "performance", label: "Performance",    icon: BarChart3,       keywords: "performance kpi seo ads ga4 trafik", primary: true },
  { sub: "keywords",    label: "Sökord",         icon: Search,          keywords: "keywords sökord universe segment", primary: true },
  { sub: "settings",    label: "Inställningar",  icon: Settings,        keywords: "settings källor data sources brand", primary: true },

  // Legacy — endast via command bar
  { sub: "overview-legacy",    label: "Översikt (legacy)",    icon: Sun,       keywords: "overview executive legacy", primary: false, legacy: true },
  { sub: "google-ads-legacy",  label: "Google Ads (legacy)",  icon: Megaphone, keywords: "ads auction audit chat legacy", primary: false, legacy: true },
  { sub: "actions-legacy",     label: "Actions (legacy)",     icon: Archive,   keywords: "actions hub legacy", primary: false, legacy: true },
  { sub: "prelaunch",          label: "Pre-launch (legacy)",  icon: Archive,   keywords: "prelaunch blueprint brief lansering", primary: false, legacy: true },
];

export function pathForRoute(workspaceId: string, sub: string): string {
  return sub ? `/clients/${workspaceId}/${sub}` : `/clients/${workspaceId}`;
}

export const PRIMARY_ROUTES = WORKSPACE_ROUTES.filter((r) => r.primary);
export const LEGACY_ROUTES = WORKSPACE_ROUTES.filter((r) => r.legacy);
