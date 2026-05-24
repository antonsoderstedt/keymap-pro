import { useNavigate } from "react-router-dom";
import {
  Sun,
  ListChecks,
  LineChart,
  Search,
  Rocket,
  Settings,
  LayoutDashboard,
  Megaphone,
  Archive,
  Clock,
  type LucideIcon,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useCommandBar } from "@/hooks/useCommandBar";

type Route = {
  label: string;
  sub: string; // relative under /clients/:id, "" = index
  keywords: string;
  icon: LucideIcon;
  legacy?: boolean;
};

const ROUTES: Route[] = [
  { label: "Idag", sub: "", keywords: "today start hem dashboard", icon: Sun },
  { label: "Åtgärder", sub: "actions", keywords: "actions pipeline queue todo förslag", icon: ListChecks },
  { label: "Performance", sub: "performance", keywords: "performance kpi seo ads ga4 trafik", icon: LineChart },
  { label: "Sökord", sub: "keywords", keywords: "keywords sökord universe segment", icon: Search },
  { label: "Pre-launch", sub: "prelaunch", keywords: "prelaunch blueprint brief lansering", icon: Rocket },
  { label: "Inställningar", sub: "settings", keywords: "settings källor data sources brand", icon: Settings },
  { label: "Översikt (legacy)", sub: "overview-legacy", keywords: "overview executive legacy", icon: LayoutDashboard, legacy: true },
  { label: "Google Ads (legacy)", sub: "google-ads-legacy", keywords: "ads auction audit chat legacy", icon: Megaphone, legacy: true },
  { label: "Actions (legacy)", sub: "actions-legacy", keywords: "actions hub legacy", icon: Archive, legacy: true },
];

interface CommandBarProps {
  workspaceId: string;
  open: boolean;
  setOpen: (v: boolean) => void;
  recent: ReturnType<typeof useCommandBar>["recent"];
  pushRecent: ReturnType<typeof useCommandBar>["pushRecent"];
}

export function CommandBar({ workspaceId, open, setOpen, recent, pushRecent }: CommandBarProps) {
  const navigate = useNavigate();

  const pathFor = (sub: string) =>
    sub ? `/clients/${workspaceId}/${sub}` : `/clients/${workspaceId}`;

  const go = (label: string, path: string) => {
    pushRecent({ label, path });
    setOpen(false);
    navigate(path);
  };

  const primary = ROUTES.filter((r) => !r.legacy);
  const legacy = ROUTES.filter((r) => r.legacy);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Sök eller hoppa till…" aria-label="Sök och navigera" />
      <CommandList>
        <CommandEmpty>Inget matchar.</CommandEmpty>

        {recent.length > 0 && (
          <>
            <CommandGroup heading="Senaste">
              {recent.map((r) => (
                <CommandItem
                  key={`recent-${r.path}`}
                  value={`recent ${r.label}`}
                  onSelect={() => go(r.label, r.path)}
                >
                  <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{r.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Navigera">
          {primary.map((r) => {
            const Icon = r.icon;
            return (
              <CommandItem
                key={r.sub || "index"}
                value={`${r.label} ${r.keywords}`}
                onSelect={() => go(r.label, pathFor(r.sub))}
              >
                <Icon className="mr-2 h-4 w-4" />
                <span>{r.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Legacy">
          {legacy.map((r) => {
            const Icon = r.icon;
            return (
              <CommandItem
                key={r.sub}
                value={`${r.label} ${r.keywords}`}
                onSelect={() => go(r.label, pathFor(r.sub))}
                className="text-muted-foreground"
              >
                <Icon className="mr-2 h-4 w-4" />
                <span>{r.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export function CommandBarTrigger({ onOpen }: { onOpen: () => void }) {
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Öppna kommandopalett (⌘K)"
      className="hidden md:inline-flex items-center gap-2 rounded-md border border-border bg-background/60 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
    >
      <Search className="h-3.5 w-3.5" />
      <span>Sök eller hoppa till…</span>
      <kbd className="ml-2 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
        {isMac ? "⌘K" : "Ctrl K"}
      </kbd>
    </button>
  );
}
