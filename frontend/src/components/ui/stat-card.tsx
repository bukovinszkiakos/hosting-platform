import type { ComponentType } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Statistic tile with an accented icon chip. Used by the dashboard, profile and
// admin pages (see docs/09-frontend-pages.md). `accent` is a tailwind class pair
// (bg + text) for the icon chip; defaults to muted.
export function StatCard({
  label,
  value,
  icon: Icon,
  accent = "bg-muted text-muted-foreground",
}: {
  label: string;
  value: number | string;
  icon: ComponentType<{ className?: string }>;
  accent?: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-lg",
            accent,
          )}
        >
          <Icon className="size-4.5" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
    </Card>
  );
}
