import { Card, CardContent } from "@/components/ui/card";
import type { ReactNode } from "react";

interface KpiCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  accent?: "primary" | "accent" | "warning" | "destructive";
}

const accentMap = {
  primary: "bg-primary/10 text-primary",
  accent: "bg-accent/10 text-accent",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
};

export function KpiCard({ label, value, hint, icon, accent = "primary" }: KpiCardProps) {
  return (
    <Card className="border-border bg-card shadow-card transition-all hover:shadow-elevated">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="stat-value">{value}</p>
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          </div>
          {icon && (
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accentMap[accent]}`}>
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
