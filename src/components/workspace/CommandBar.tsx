import { useNavigate } from "react-router-dom";
import { Search, Clock } from "lucide-react";
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
import { PRIMARY_ROUTES, LEGACY_ROUTES, pathForRoute } from "@/lib/workspaceRoutes";

interface CommandBarProps {
  workspaceId: string;
  open: boolean;
  setOpen: (v: boolean) => void;
  recent: ReturnType<typeof useCommandBar>["recent"];
  pushRecent: ReturnType<typeof useCommandBar>["pushRecent"];
}

export function CommandBar({ workspaceId, open, setOpen, recent, pushRecent }: CommandBarProps) {
  const navigate = useNavigate();

  const pathFor = (sub: string) => pathForRoute(workspaceId, sub);

  const go = (label: string, path: string) => {
    pushRecent({ label, path });
    setOpen(false);
    navigate(path);
  };

  const primary = PRIMARY_ROUTES;
  const legacy = LEGACY_ROUTES;

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

export function CommandBarMobileTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Öppna kommandopalett"
      className="inline-flex md:hidden items-center justify-center rounded-md border border-border bg-background/60 p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
    >
      <Search className="h-4 w-4" />
    </button>
  );
}

