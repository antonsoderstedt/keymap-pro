// PrelaunchStepper — visuell progress för pre-launch-flödet.
// Brief → Faktakoll → Marknad → Sökord → Strategi → Export

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type PrelaunchStep = "brief" | "factcheck" | "market" | "keywords" | "strategy" | "export";

const STEPS: { key: PrelaunchStep; label: string }[] = [
  { key: "brief", label: "Brief" },
  { key: "factcheck", label: "Faktakoll" },
  { key: "market", label: "Marknad" },
  { key: "keywords", label: "Sökord" },
  { key: "strategy", label: "Strategi" },
  { key: "export", label: "Export" },
];

interface Props {
  current: PrelaunchStep;
  completed: PrelaunchStep[];
  onStepClick?: (step: PrelaunchStep) => void;
}

export function PrelaunchStepper({ current, completed, onStepClick }: Props) {
  const currentIdx = STEPS.findIndex(s => s.key === current);

  return (
    <div className="flex items-center w-full overflow-x-auto pb-2">
      {STEPS.map((step, i) => {
        const isDone = completed.includes(step.key);
        const isCurrent = step.key === current;
        const isClickable = !!onStepClick && (isDone || i <= currentIdx);

        return (
          <div key={step.key} className="flex items-center flex-1 min-w-0">
            <button
              onClick={() => isClickable && onStepClick?.(step.key)}
              disabled={!isClickable}
              className={cn(
                "flex flex-col items-center gap-1.5 group min-w-0",
                isClickable && "cursor-pointer",
                !isClickable && "cursor-not-allowed opacity-60",
              )}
            >
              <div
                className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors",
                  isDone && "bg-primary border-primary text-primary-foreground",
                  isCurrent && !isDone && "border-primary text-primary bg-primary/10",
                  !isDone && !isCurrent && "border-border text-muted-foreground bg-card",
                )}
              >
                {isDone ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span
                className={cn(
                  "text-[11px] uppercase tracking-wider font-medium whitespace-nowrap",
                  isCurrent ? "text-primary" : isDone ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </button>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-2 -mt-5 transition-colors",
                  completed.includes(STEPS[i + 1].key) || (isDone && i + 1 <= currentIdx)
                    ? "bg-primary"
                    : "bg-border",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
