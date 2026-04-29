import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import Auth from "./pages/Auth";
import Clients from "./pages/Clients";
import ProjectWizard from "./pages/ProjectWizard";
import Results from "./pages/Results";
import KeywordUniverse from "./pages/KeywordUniverse";
import WorkspaceKeywordUniverse from "./pages/workspace/WorkspaceKeywordUniverse";
import WorkspaceSegments from "./pages/workspace/WorkspaceSegments";
import NotFound from "./pages/NotFound";
import { WorkspaceLayout } from "@/components/workspace/WorkspaceLayout";
import WorkspaceOverview from "./pages/workspace/WorkspaceOverview";
import ActionTracker from "./pages/workspace/ActionTracker";
import WorkspaceArtifacts from "./pages/workspace/WorkspaceArtifacts";
import ComingSoon from "./pages/workspace/ComingSoon";
import BrandKit from "./pages/workspace/BrandKit";
import ExecutiveDashboard from "./pages/workspace/ExecutiveDashboard";
import SeoDashboard from "./pages/workspace/SeoDashboard";
import Ga4Dashboard from "./pages/workspace/Ga4Dashboard";
import PaidVsOrganic from "./pages/workspace/PaidVsOrganic";
import SeoAudit from "./pages/workspace/SeoAudit";
import Alerts from "./pages/workspace/Alerts";
import AuctionInsights from "./pages/workspace/AuctionInsights";
import ReportsLibrary from "./pages/workspace/ReportsLibrary";
import WorkspaceSettings from "./pages/workspace/WorkspaceSettings";

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
          <Route path="/" element={<Navigate to="/clients" replace />} />
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
            <Route path="overview" element={<WorkspaceOverview />} />
            <Route path="actions" element={<ActionTracker />} />
            <Route path="artifacts" element={<WorkspaceArtifacts />} />
            <Route path="keyword-universe" element={<WorkspaceKeywordUniverse />} />
            <Route path="segments" element={<WorkspaceSegments />} />
            <Route path="reports" element={<ReportsLibrary />} />
            <Route path="seo" element={<SeoDashboard />} />
            <Route path="google-ads" element={<AuctionInsights />} />
            <Route path="auction-insights" element={<AuctionInsights />} />
            <Route path="ga4" element={<Ga4Dashboard />} />
            <Route path="paid-vs-organic" element={<PaidVsOrganic />} />
            <Route path="audit" element={<SeoAudit />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="brand-kit" element={<BrandKit />} />
            <Route path="settings" element={<WorkspaceSettings />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
