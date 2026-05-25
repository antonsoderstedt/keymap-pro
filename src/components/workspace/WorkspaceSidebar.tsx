// Sidomeny — läser från workspaceRoutes (Sprint 2 — Day 1: single source of truth).

import { NavLink, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PRIMARY_ROUTES, pathForRoute } from "@/lib/workspaceRoutes";

interface SidebarProps {
  workspaceId: string;
  workspaceName: string;
  workspaceCompany?: string | null;
}

export function WorkspaceSidebar({ workspaceId, workspaceName, workspaceCompany }: SidebarProps) {
  const navigate = useNavigate();

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
      </div>

      <TooltipProvider delayDuration={150}>
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {PRIMARY_ROUTES.map((item) => {
            const Icon = item.icon;
            const to = pathForRoute(workspaceId, item.sub);
            return (
              <NavLink
                key={item.sub || "index"}
                to={to}
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
    </aside>
  );
}
