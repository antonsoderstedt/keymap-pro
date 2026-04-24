import { useEffect, useState } from "react";
import { LayoutGrid, Users, Search, Megaphone, Target } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { id: "overview", label: "Översikt", icon: LayoutGrid },
  { id: "segments", label: "Segment", icon: Users },
  { id: "keywords", label: "Sökord", icon: Search },
  { id: "channels", label: "Kanaler", icon: Megaphone },
  { id: "action", label: "Action", icon: Target },
];

export function ResultsSidebar() {
  const [active, setActive] = useState("overview");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    items.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const handleClick = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav className="sticky top-24 hidden w-52 shrink-0 lg:block">
      <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sektioner</p>
      <ul className="space-y-0.5">
        {items.map(({ id, label, icon: Icon }, i) => (
          <li key={id}>
            <button
              onClick={() => handleClick(id)}
              className={cn(
                "group flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors",
                active === id
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <span className={cn(
                "flex h-5 w-5 items-center justify-center rounded font-mono text-[10px]",
                active === id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>{i + 1}</span>
              <Icon className="h-4 w-4" />
              {label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
