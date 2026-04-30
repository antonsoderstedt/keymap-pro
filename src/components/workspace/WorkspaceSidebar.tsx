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
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: any;
  badge?: string;
}

interface SidebarProps {
  workspaceId: string;
  workspaceName: string;
  workspaceCompany?: string | null;
}

export function WorkspaceSidebar({ workspaceId, workspaceName, workspaceCompany }: SidebarProps) {
  const navigate = useNavigate();
  const base = `/clients/${workspaceId}`;

  const sections: { title: string; items: NavItem[] }[] = [
    {
      title: "Översikt",
      items: [
        { to: `${base}`, label: "Executive", icon: LayoutDashboard },
        { to: `${base}/performance`, label: "Performance & mål", icon: LineChart },
        { to: `${base}/briefing`, label: "Veckans briefing", icon: Sparkles, badge: "premium" },
        { to: `${base}/overview`, label: "Workspace-översikt", icon: ClipboardCheck },
      ],
    },
    {
      title: "Kanaler",
      items: [
        { to: `${base}/seo`, label: "SEO", icon: TrendingUp },
        { to: `${base}/google-ads`, label: "Google Ads", icon: Sparkles, badge: "preview" },
        { to: `${base}/ga4`, label: "GA4", icon: LayoutDashboard },
        { to: `${base}/paid-vs-organic`, label: "Paid vs Organic", icon: Layers },
      ],
    },
    {
      title: "Analys",
      items: [
        { to: `${base}/keyword-universe`, label: "Sökordsuniversum", icon: Search },
        { to: `${base}/segments`, label: "Segment & paket", icon: Layers },
      ],
    },
    {
      title: "Action & uppföljning",
      items: [
        { to: `${base}/actions`, label: "Action Tracker", icon: ListChecks },
        { to: `${base}/audit`, label: "SEO Audit", icon: ShieldCheck },
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
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-6">
        {sections.map((section) => (
          <div key={section.title}>
            <h3 className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.title}
            </h3>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
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
                    {item.badge && (
                      <span className="text-[9px] uppercase font-medium tracking-wide text-muted-foreground/70">
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
