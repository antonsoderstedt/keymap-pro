import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useActionItems } from "@/hooks/useActionItems";
import { useDataSourcesStatus } from "@/hooks/useDataSourcesStatus";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import RoiOverview from "@/components/workspace/RoiOverview";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "God natt";
  if (h < 10) return "God morgon";
  if (h < 17) return "God dag";
  return "God kväll";
}

function firstName(email: string | null | undefined) {
  if (!email) return "";
  const local = email.split("@")[0] ?? "";
  const part = local.split(/[._-]/)[0] ?? "";
  return part ? part.charAt(0).toUpperCase() + part.slice(1) : "";
}

function categoryLabel(c: string) {
  switch (c) {
    case "seo": return "SEO";
    case "ads": return "Google Ads";
    case "content": return "Innehåll";
    case "technical": return "Teknisk";
    default: return "Övrigt";
  }
}

export default function Today() {
  const { workspace } = useWorkspace();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { items, loading, error, update, markImplemented } = useActionItems(workspace?.id);
  const { data: sources } = useDataSourcesStatus(workspace?.id);

  const open = useMemo(
    () => items.filter((i) => i.status === "todo" || i.status === "in_progress"),
    [items],
  );
  const primary = open[0] ?? null;
  const remaining = Math.max(0, open.length - 1);

  const sourceIssues = (sources?.sources ?? []).filter((s) => s.status !== "ok");

  const onApprove = async () => {
    if (!primary) return;
    const { error: err } = await markImplemented(primary.id);
    if (err) toast.error("Kunde inte uppdatera åtgärden.");
    else toast.success("Markerad som klar.");
  };

  const onDefer = async () => {
    if (!primary) return;
    const due = new Date();
    due.setDate(due.getDate() + 7);
    const { error: err } = await update(primary.id, { due_date: due.toISOString() });
    if (err) toast.error("Kunde inte skjuta upp åtgärden.");
    else toast.success("Skjuten till nästa vecka.");
  };

  const onOpen = () => {
    if (!primary || !workspace) return;
    navigate(`/clients/${workspace.id}/actions?focus=a:${primary.id}&from=today`);
  };

  const name = firstName(user?.email);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 lg:py-16">
      <header className="mb-10">
        <p className="text-sm text-muted-foreground">
          {greeting()}{name ? `, ${name}` : ""}.
        </p>
        {workspace && (
          <p className="text-sm text-muted-foreground/70">{workspace.name}</p>
        )}
      </header>

      <section aria-labelledby="next-action">
        <p
          id="next-action"
          className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          Nästa åtgärd
        </p>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <div className="flex gap-2 pt-3">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-20" />
            </div>
          </div>
        ) : error ? (
          <p className="text-sm text-muted-foreground">
            Åtgärder kunde inte laddas. Försök igen.
          </p>
        ) : !primary ? (
          <div className="space-y-2">
            <h2 className="text-xl font-medium tracking-tight">
              Inga åtgärder just nu.
            </h2>
            <p className="text-sm text-muted-foreground">
              Kör en analys för att hitta nya möjligheter.{" "}
              {workspace && (
                <button
                  onClick={() => navigate(`/clients/${workspace.id}/actions`)}
                  className="underline-offset-4 hover:underline text-foreground"
                >
                  Öppna åtgärder
                </button>
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-2xl font-medium tracking-tight leading-snug">
              {primary.title}
            </h2>
            {primary.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {primary.description}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {primary.expected_impact_sek
                ? `+${primary.expected_impact_sek.toLocaleString("sv-SE")} kr/mån · `
                : ""}
              {categoryLabel(primary.category)}
            </p>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button size="sm" onClick={onApprove}>
                Godkänn
              </Button>
              <Button size="sm" variant="outline" onClick={onDefer}>
                Skjut upp
              </Button>
              <Button size="sm" variant="ghost" onClick={onOpen}>
                Visa i åtgärder
              </Button>
            </div>
          </div>
        )}
      </section>

      {workspace && !loading && primary && (
        <div className="mt-16">
          <RoiOverview projectId={workspace.id} />
        </div>
      )}

      {(remaining > 0 || sourceIssues.length > 0) && (
        <footer className="mt-12 space-y-2 border-t border-border/40 pt-6 text-xs text-muted-foreground">
          {remaining > 0 && workspace && (
            <button
              onClick={() => navigate(`/clients/${workspace.id}/actions`)}
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
            >
              {remaining} {remaining === 1 ? "till åtgärd" : "fler åtgärder"} väntar
              <ArrowRight className="h-3 w-3" />
            </button>
          )}
          {sourceIssues.length > 0 && (
            <p>
              Datakällor:{" "}
              {sourceIssues
                .map((s) => `${s.source.toUpperCase()} ${s.status === "not_connected" ? "ej ansluten" : "varning"}`)
                .join(" · ")}
            </p>
          )}
        </footer>
      )}
    </div>
  );
}
