import { Outlet } from "react-router-dom";
import { useWorkspace } from "@/hooks/useWorkspace";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { MobileWorkspaceSidebar } from "./MobileWorkspaceSidebar";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GoogleReauthBanner } from "@/components/GoogleReauthBanner";
import { DataSourceAlerts } from "@/components/DataSourceAlerts";
import { useAutoSync } from "@/hooks/useAutoSync";

export function WorkspaceLayout() {
  const { workspace, loading } = useWorkspace();
  const { user, signOut } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full bg-primary animate-pulse" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Kunden hittades inte.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <WorkspaceSidebar
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        workspaceCompany={workspace.company}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur px-6 py-3 flex items-center justify-between">
          <div className="md:hidden flex items-center gap-2">
            <MobileWorkspaceSidebar
              workspaceId={workspace.id}
              workspaceName={workspace.name}
              workspaceCompany={workspace.company}
            />
            <h1 className="font-serif text-lg truncate">{workspace.name}</h1>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <span className="hidden sm:inline text-xs text-muted-foreground">{user?.email}</span>
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <GoogleReauthBanner />
        <DataSourceAlerts projectId={workspace.id} />
        <main className="flex-1 overflow-x-hidden">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
