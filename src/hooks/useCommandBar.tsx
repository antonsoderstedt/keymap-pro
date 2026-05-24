import { useCallback, useEffect, useState } from "react";

export type RecentEntry = { path: string; label: string; ts: number };

const MAX_RECENT = 5;
const storageKey = (workspaceId: string) => `lovable:cmdbar:recent:${workspaceId}`;

function readRecent(workspaceId: string): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(workspaceId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is RecentEntry =>
        x && typeof x.path === "string" && typeof x.label === "string" && typeof x.ts === "number",
    );
  } catch {
    return [];
  }
}

export function useCommandBar(workspaceId: string) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<RecentEntry[]>(() => readRecent(workspaceId));

  // Reset recent when workspace changes
  useEffect(() => {
    setRecent(readRecent(workspaceId));
  }, [workspaceId]);

  // Global ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pushRecent = useCallback(
    (entry: Omit<RecentEntry, "ts">) => {
      setRecent((prev) => {
        const next = [{ ...entry, ts: Date.now() }, ...prev.filter((r) => r.path !== entry.path)].slice(
          0,
          MAX_RECENT,
        );
        try {
          window.localStorage.setItem(storageKey(workspaceId), JSON.stringify(next));
        } catch {
          /* ignore quota */
        }
        return next;
      });
    },
    [workspaceId],
  );

  return { open, setOpen, recent, pushRecent };
}
