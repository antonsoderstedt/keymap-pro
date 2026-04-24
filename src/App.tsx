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
import NotFound from "./pages/NotFound";
import { WorkspaceLayout } from "@/components/workspace/WorkspaceLayout";
import WorkspaceOverview from "./pages/workspace/WorkspaceOverview";
import ActionTracker from "./pages/workspace/ActionTracker";
import WorkspaceArtifacts from "./pages/workspace/WorkspaceArtifacts";
import ComingSoon from "./pages/workspace/ComingSoon";

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
            <Route index element={<WorkspaceOverview />} />
            <Route path="actions" element={<ActionTracker />} />
            <Route path="artifacts" element={<WorkspaceArtifacts />} />
            <Route path="keyword-universe" element={<ComingSoon title="Sökordsuniversum" description="Genvägen öppnar resultatvyn för senaste analys." phase="Snart inbakad i layouten" />} />
            <Route path="segments" element={<ComingSoon title="Segment & paket" description="Segment med färdiga paket: landningssida, meta, Google Ads-kampanj." />} />
            <Route path="reports" element={<ComingSoon title="Rapportbibliotek" description="Executive, Auction Insights, Konkurrent, Share of Voice m.fl." phase="Fas 5" />} />
            <Route path="seo" element={<ComingSoon title="SEO Dashboard" description="GSC-data, ranking, klick, CTR + AI-insikter." phase="Fas 2" />} />
            <Route path="google-ads" element={<ComingSoon title="Google Ads" description="Performance, Auction Insights, anomaly detection, optimeringsförslag." phase="Fas 3" />} />
            <Route path="ga4" element={<ComingSoon title="GA4 Dashboard" description="Trafik, konvertering, källor — kopplat till åtgärder." phase="Fas 2" />} />
            <Route path="paid-vs-organic" element={<ComingSoon title="Paid vs Organic" description="SEO-kannibalisering, brand vs non-brand." phase="Fas 3" />} />
            <Route path="audit" element={<ComingSoon title="SEO Audit" description="Findings med checkbox-actions, automatisk uppföljning av effekt." phase="Fas 4" />} />
            <Route path="alerts" element={<ComingSoon title="Alerts & Optimeringar" description="AI-bevakning av Google Ads med one-click implementera." phase="Fas 3" />} />
            <Route path="brand-kit" element={<ComingSoon title="Brand Kit" description="Logo, färger, typsnitt, tone of voice — appliceras på alla exporter och AI-prompts." phase="Fas 2" />} />
            <Route path="settings" element={<ComingSoon title="Inställningar" description="Kopplingar, KPI-mål, automation-regler." />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
