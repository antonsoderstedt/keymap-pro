// 7-områdes sidomeny — konsoliderad navigation enligt Fas 1.
// Underrutter exponeras inom varje sektion via WorkspaceSettings/sub-tabs där det behövs.

import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Search,
  ClipboardCheck,
  ListChecks,
  FileText,
  Settings,
  TrendingUp,
  ArrowLeft,
  Rocket,
  Lock,
  Target,
  Megaphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjectCapabilities } from "@/hooks/useProjectCapabilities";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface NavItem {
  to: string;
  label: string;
  icon: any;
  enabled?: boolean;
  lockedReason?: string;
  unlockTo?: string;
  hidden?: boolean;
  end?: boolean;
}

interface SidebarProps {
  workspaceId: string;
  workspaceName: string;
  workspaceCompany?: string | null;
}

export function WorkspaceSidebar({ workspaceId, workspaceName, workspaceCompany }: SidebarProps) {
  const navigate = useNavigate();
  const base = `/clients/${workspaceId}`;
  const caps = useProjectCapabilities(workspaceId);
  const settingsTo = `${base}/settings`;
  const noData = !caps.hasGA4 && !caps.hasGSC && !caps.hasAnalysis && !caps.hasPrelaunch;

  // 7 huvudområden — varje ikon = en hub. Underrutter nås via flikar inuti.
  const items: NavItem[] = [
    { to: base, label: "Översikt", icon: LayoutDashboard, end: true },
    {
      to: `${base}/performance`,
      label: "Performance & mål",
      icon: Target,
      enabled: caps.hasGA4 || caps.hasGSC,
      lockedReason: "Koppla GA4 eller Search Console.",
      unlockTo: settingsTo,
    },
    {
      to: `${base}/channels`,
      label: "Kanaler",
      icon: Megaphone,
      enabled: caps.hasGA4 || caps.hasGSC || caps.hasAds,
      lockedReason: "Koppla minst en datakälla (GA4, GSC eller Ads).",
      unlockTo: settingsTo,
    },
    {
      to: `${base}/keyword-universe`,
      label: "Sökord & innehåll",
      icon: Search,
      enabled: caps.hasKeywordUniverse || !caps.loading,
    },
    {
      to: caps.hasAnalysis || caps.hasPrelaunch ? `${base}/actions` : `${base}/prelaunch`,
      label: caps.hasAnalysis || caps.hasPrelaunch ? "Action" : "Pre-launch",
      icon: caps.hasAnalysis || caps.hasPrelaunch ? ListChecks : Rocket,
    },
    { to: `${base}/reports`, label: "Rapporter", icon: FileText },
    { to: settingsTo, label: "Inställningar", icon: Settings },
  ];

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-card/40 h-screen sticky top-0">
      <div className="border-b border-border p-4">
        <button
          onClick={() => navigate("/clients")}
          className="mb-4 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          Min byrå
        </button>
        <div>
          <h2 className="font-serif text-lg leading-tight">{workspaceName}</h2>
          {workspaceCompany && (
            <p className="text-xs text-muted-foreground mt-0.5">{workspaceCompany}</p>
          )}
        </div>
        {noData && !caps.loading && (
          <div className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
            Koppla data för att låsa upp alla områden. Se Översikt.
          </div>
        )}
      </div>

      <TooltipProvider delayDuration={150}>
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {items.map((item) => {
            if (item.hidden) return null;
            const Icon = item.icon;
            const enabled = item.enabled !== false;

            if (!enabled) {
              return (
                <Tooltip key={item.to}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => item.unlockTo && navigate(item.unlockTo)}
                      className="w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/30 transition-colors"
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 text-left">{item.label}</span>
                      <Lock className="h-3 w-3 shrink-0" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-[220px]">
                    <p className="text-xs">{item.lockedReason}</p>
                    {item.unlockTo && <p className="text-[10px] text-muted-foreground mt-1">Klicka för att gå dit →</p>}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </TooltipProvider>

      <div className="border-t border-border p-3">
        <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
          Underrutter (SEO Audit, Ads Audit, Brand Kit m.fl.) nås via flikar inom varje område.
        </p>
      </div>
    </aside>
  );
}
