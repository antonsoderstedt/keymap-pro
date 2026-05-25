import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, Clock, MessageSquare } from "lucide-react";
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
import { AskAnswerPanel, type AskAnswer } from "./AskAnswerPanel";
import { supabase } from "@/integrations/supabase/client";

interface CommandBarProps {
  workspaceId: string;
  open: boolean;
  setOpen: (v: boolean) => void;
  recent: ReturnType<typeof useCommandBar>["recent"];
  pushRecent: ReturnType<typeof useCommandBar>["pushRecent"];
}

// Implicit ASK detection: explicit prefix, trailing "?", or "natural language" query (>4 words).
function isAskQuery(q: string): boolean {
  const trimmed = q.trim();
  if (!trimmed) return false;
  if (/^(ask|fråga)[:\s]/i.test(trimmed)) return true;
  if (trimmed.startsWith("?")) return true;
  if (trimmed.endsWith("?")) return true;
  const words = trimmed.split(/\s+/).filter(Boolean);
  return words.length >= 5;
}

function stripAskPrefix(q: string): string {
  return q.trim().replace(/^(ask|fråga)[:\s]+/i, "").replace(/^\?+/, "").trim();
}

export function CommandBar({ workspaceId, open, setOpen, recent, pushRecent }: CommandBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [askAnswer, setAskAnswer] = useState<AskAnswer | null>(null);
  const [askedQuery, setAskedQuery] = useState<string | null>(null);

  // Reset transient state on open/close.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setAskAnswer(null);
      setAskError(null);
      setAskLoading(false);
      setAskedQuery(null);
    }
  }, [open]);

  const askMode = useMemo(() => isAskQuery(query), [query]);
  const isAnsweredOrAnswering = askLoading || !!askAnswer || !!askError;

  const pathFor = (sub: string) => pathForRoute(workspaceId, sub);

  const go = (label: string, path: string) => {
    pushRecent({ label, path });
    setOpen(false);
    navigate(path);
  };

  const handleCitation = (sub: string, label: string) => {
    go(label, pathFor(sub));
  };

  const submitAsk = async () => {
    const q = stripAskPrefix(query);
    if (q.length < 3) return;
    setAskLoading(true);
    setAskError(null);
    setAskAnswer(null);
    setAskedQuery(q);
    try {
      const { data, error } = await supabase.functions.invoke("ask-operator", {
        body: {
          projectId: workspaceId,
          question: q,
          context: { route: location.pathname },
        },
      });
      if (error) {
        setAskError(error.message || "Kunde inte hämta svar.");
      } else if (data?.error) {
        setAskError(data.error);
      } else {
        setAskAnswer(data as AskAnswer);
      }
    } catch (e) {
      setAskError((e as Error).message || "Något gick fel.");
    } finally {
      setAskLoading(false);
    }
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <CommandInput
          placeholder={askMode ? "Fråga om kundens data…" : "Sök eller hoppa till…"}
          aria-label="Sök och navigera"
          value={query}
          onValueChange={(v) => {
            setQuery(v);
            // If user keeps typing after an answer, clear the stale answer.
            if (askAnswer || askError) {
              setAskAnswer(null);
              setAskError(null);
              setAskedQuery(null);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && askMode && !askLoading) {
              // If still composing (no answer yet for this exact query) → submit ASK.
              if (askedQuery !== stripAskPrefix(query)) {
                e.preventDefault();
                submitAsk();
              }
            }
          }}
          className="border-0"
        />
        <div className="ml-2 shrink-0">
          {askMode ? (
            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <MessageSquare className="h-3 w-3" /> Fråga
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded bg-muted/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/70">
              Navigera
            </span>
          )}
        </div>
      </div>

      {askMode && isAnsweredOrAnswering ? (
        <AskAnswerPanel
          loading={askLoading}
          error={askError}
          answer={askAnswer}
          onCitation={handleCitation}
        />
      ) : askMode ? (
        <div className="px-4 py-6 text-xs text-muted-foreground">
          Tryck Enter för att fråga. Svaret bygger endast på den här kundens data och visar evidence och källor.
        </div>
      ) : (
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
            {PRIMARY_ROUTES.map((r) => {
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

          <CommandGroup heading="Situationsspecifikt">
            {LEGACY_ROUTES.map((r) => {
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
      )}
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
      <span>Sök, hoppa eller fråga…</span>
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
