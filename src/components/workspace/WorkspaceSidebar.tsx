import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Search,
  Layers,
  ClipboardCheck,
  ListChecks,
  Bell,
  FileText,
  Palette,
  Settings,
  TrendingUp,
  ArrowLeft,
  Sparkles,
  ShieldCheck,
  LineChart,
  Rocket,
  MessageSquare,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjectCapabilities } from "@/hooks/useProjectCapabilities";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface NavItem {
  to: string;
  label: string;
  icon: any;
  /** If false, item is greyed and tooltip explains how to unlock. */
  enabled?: boolean;
  lockedReason?: string;
  unlockTo?: string;
  /** Hide entirely (e.g. pre-launch when analysis exists) */
  hidden?: boolean;
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

  const sections: { title: string; items: NavItem[] }[] = [
    {
      title: "Översikt",
      items: [
        { to: `${base}`, label: "Executive", icon: LayoutDashboard },
        {
          to: `${base}/performance`, label: "Performance & mål", icon: LineChart,
          enabled: caps.hasGA4 || caps.hasGSC,
          lockedReason: "Koppla GA4 eller Search Console för att se performance.",
          unlockTo: settingsTo,
        },
        {
          to: `${base}/briefing`, label: "Veckans briefing", icon: Sparkles,
          enabled: caps.hasGA4 || caps.hasGSC,
          lockedReason: "Briefingen behöver minst en datakälla (GA4 eller Search Console).",
          unlockTo: settingsTo,
        },
        { to: `${base}/overview`, label: "Workspace-översikt", icon: ClipboardCheck },
      ],
    },
    {
      title: "Kanaler",
      items: [
        {
          to: `${base}/seo`, label: "SEO", icon: TrendingUp,
          enabled: caps.hasGSC,
          lockedReason: "Koppla Google Search Console.",
          unlockTo: settingsTo,
        },
        {
          to: `${base}/google-ads`, label: "Google Ads", icon: Sparkles,
          enabled: caps.hasAds, lockedReason: "Koppla Google Ads-konto.", unlockTo: settingsTo,
        },
        {
          to: `${base}/ads-audit`, label: "Ads Audit", icon: ShieldCheck,
          enabled: caps.hasAds, lockedReason: "Kräver Google Ads-koppling.", unlockTo: settingsTo,
        },
        {
          to: `${base}/ads-chat`, label: "PPC-chat", icon: MessageSquare,
          enabled: caps.hasAds, lockedReason: "Kräver Google Ads-koppling.", unlockTo: settingsTo,
        },
        {
          to: `${base}/ga4`, label: "GA4", icon: LayoutDashboard,
          enabled: caps.hasGA4, lockedReason: "Koppla GA4-property.", unlockTo: settingsTo,
        },
        {
          to: `${base}/paid-vs-organic`, label: "Paid vs Organic", icon: Layers,
          enabled: caps.hasGA4 && caps.hasAds,
          lockedReason: "Kräver både GA4 och Google Ads.",
          unlockTo: settingsTo,
        },
      ],
    },
    {
      title: "Analys",
      items: [
        {
          to: `${base}/keyword-universe`, label: "Sökordsuniversum", icon: Search,
          enabled: caps.hasKeywordUniverse,
          lockedReason: "Kör en analys eller pre-launch först.",
          unlockTo: caps.hasPrelaunch ? `${base}/prelaunch` : `/project/${workspaceId}`,
        },
        { to: `${base}/segments`, label: "Segment & paket", icon: Layers },
        {
          to: `${base}/prelaunch`, label: "Pre-launch Blueprint", icon: Rocket,
          // Dölj pre-launch när det finns riktig analys
          hidden: caps.hasAnalysis && !caps.hasPrelaunch,
        },
      ],
    },
    {
      title: "Action & uppföljning",
      items: [
        { to: `${base}/actions`, label: "Action Tracker", icon: ListChecks },
        {
          to: `${base}/audit`, label: "SEO Audit", icon: ShieldCheck,
          enabled: caps.hasGSC || caps.hasAnalysis,
          lockedReason: "Kräver Search Console eller en körd analys.",
          unlockTo: settingsTo,
        },
        { to: `${base}/alerts`, label: "Alerts", icon: Bell },
      ],
    },
    {
      title: "Innehåll & strategi",
      items: [
        { to: `${base}/reports`, label: "Rapporter", icon: FileText },
        { to: `${base}/artifacts`, label: "Artefakter", icon: ClipboardCheck },
      ],
    },
    {
      title: "Inställningar",
      items: [
        { to: `${base}/brand-kit`, label: "Brand Kit", icon: Palette },
        { to: `${base}/settings`, label: "Inställningar", icon: Settings },
      ],
    },
  ];

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-card/40 h-screen sticky top-0">
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
          <div className="mt-3 text-[11px] text-muted-foreground">
            Många paneler är låsta tills data är kopplad. Se onboarding-listan på Executive.
          </div>
        )}
      </div>

      <TooltipProvider delayDuration={150}>
        <nav className="flex-1 overflow-y-auto p-3 space-y-6">
          {sections.map((section) => {
            const visibleItems = section.items.filter(i => !i.hidden);
            if (visibleItems.length === 0) return null;
            return (
              <div key={section.title}>
                <h3 className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </h3>
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const enabled = item.enabled !== false;

                    if (!enabled) {
                      return (
                        <Tooltip key={item.to}>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => item.unlockTo && navigate(item.unlockTo)}
                              className="w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/30 transition-colors"
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
                        end={item.to === base}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
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
                </div>
              </div>
            );
          })}
        </nav>
      </TooltipProvider>
    </aside>
  );
}
