import type { ReactNode } from "react";

interface SectionHeaderProps {
  number?: number;
  title: string;
  description: string;
  action?: ReactNode;
}

export function SectionHeader({ number, title, description, action }: SectionHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1.5">
        <div className="flex items-center gap-3">
          {number && (
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 font-mono text-sm font-semibold text-primary">
              {number}
            </span>
          )}
          <h2 className="section-heading">{title}</h2>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
