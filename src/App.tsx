import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import Auth from "./pages/Auth";
import Landing from "./pages/Landing";
import Docs from "./pages/Docs";
import Clients from "./pages/Clients";
import ProjectWizard from "./pages/ProjectWizard";
import Results from "./pages/Results";
import KeywordUniverse from "./pages/KeywordUniverse";
// WorkspaceSegments is now redirected to KeywordsHub via WorkspaceRedirect — no direct import needed
import NotFound from "./pages/NotFound";
import { WorkspaceLayout } from "@/components/workspace/WorkspaceLayout";
import ExecutiveDashboard from "./pages/workspace/ExecutiveDashboard";
import ReportsLibrary from "./pages/workspace/ReportsLibrary";
import WorkspaceSettings from "./pages/workspace/WorkspaceSettings";
import PrelaunchBlueprint from "./pages/workspace/PrelaunchBlueprint";
import GoogleAdsHub from "./pages/workspace/GoogleAdsHub";
import KeywordsHub from "./pages/workspace/KeywordsHub";
import ActionHub from "./pages/workspace/ActionHub";
import { useParams } from "react-router-dom";

// Wrapper: läser :id och redirectar till motsvarande nya route.
function WorkspaceRedirect({ to }: { to: (id: string) => string }) {
  const { id = "" } = useParams<{ id: string }>();
  return <Navigate to={to(id)} replace />;
}

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background"><div className="h-8 w-8 rounded-full bg-primary animate-pulse-glow" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background"><div className="h-8 w-8 rounded-full bg-primary animate-pulse-glow" /></div>;
  if (user) return <Navigate to="/clients" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/auth" element={<AuthRoute><Auth /></AuthRoute>} />

          {/* Min byrå (klientlista) */}
          <Route path="/clients" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
          {/* Bakåtkompatibilitet */}
          <Route path="/dashboard" element={<Navigate to="/clients" replace />} />

          {/* Wizard (skapa/onboarda kund + kör analys) */}
          <Route path="/project/:id" element={<ProtectedRoute><ProjectWizard /></ProtectedRoute>} />
          <Route path="/project/:id/results" element={<ProtectedRoute><Results /></ProtectedRoute>} />
          <Route path="/project/:id/results/universe" element={<ProtectedRoute><KeywordUniverse /></ProtectedRoute>} />

          {/* Workspace per kund */}
          <Route path="/clients/:id" element={<ProtectedRoute><WorkspaceLayout /></ProtectedRoute>}>
            <Route index element={<ExecutiveDashboard />} />
            <Route path="google-ads" element={<GoogleAdsHub />} />
            <Route path="keywords" element={<KeywordsHub />} />
            <Route path="actions" element={<ActionHub />} />
            <Route path="reports" element={<ReportsLibrary />} />
            <Route path="settings" element={<WorkspaceSettings />} />
            <Route path="prelaunch" element={<PrelaunchBlueprint />} />

            {/* Bakåtkompatibilitet — gamla rutter redirectar */}
            <Route path="performance" element={<WorkspaceRedirect to={(id) => `/clients/${id}`} />} />
            <Route path="channels" element={<WorkspaceRedirect to={(id) => `/clients/${id}/google-ads`} />} />
            <Route path="keyword-universe" element={<WorkspaceRedirect to={(id) => `/clients/${id}/keywords`} />} />
            <Route path="segments" element={<WorkspaceRedirect to={(id) => `/clients/${id}/keywords`} />} />
            <Route path="auction-insights" element={<WorkspaceRedirect to={(id) => `/clients/${id}/google-ads`} />} />
            <Route path="ads-audit" element={<WorkspaceRedirect to={(id) => `/clients/${id}/google-ads`} />} />
            <Route path="ads-chat" element={<WorkspaceRedirect to={(id) => `/clients/${id}/google-ads`} />} />
            <Route path="ga4" element={<WorkspaceRedirect to={(id) => `/clients/${id}`} />} />
            <Route path="paid-vs-organic" element={<WorkspaceRedirect to={(id) => `/clients/${id}`} />} />
            <Route path="seo" element={<WorkspaceRedirect to={(id) => `/clients/${id}`} />} />
            <Route path="briefing" element={<WorkspaceRedirect to={(id) => `/clients/${id}`} />} />
            <Route path="overview" element={<WorkspaceRedirect to={(id) => `/clients/${id}`} />} />
            <Route path="audit" element={<WorkspaceRedirect to={(id) => `/clients/${id}/actions`} />} />
            <Route path="alerts" element={<WorkspaceRedirect to={(id) => `/clients/${id}/actions`} />} />
            <Route path="artifacts" element={<WorkspaceRedirect to={(id) => `/clients/${id}/reports`} />} />
            <Route path="brand-kit" element={<WorkspaceRedirect to={(id) => `/clients/${id}/settings`} />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
