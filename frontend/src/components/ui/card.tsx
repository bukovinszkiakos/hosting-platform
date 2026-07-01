import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

// Base surface used across the app. `interactive` adds a subtle hover lift for
// clickable cards (project/deployment rows). See docs/09-frontend-pages.md.
export function Card({
  className,
  interactive = false,
  ...props
}: ComponentProps<"div"> & { interactive?: boolean }) {
  return (
    <div
      data-slot="card"
      className={cn(
        "rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(20,20,40,0.04),0_14px_30px_-20px_rgba(20,20,45,0.16)]",
        interactive &&
          "transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_1px_2px_rgba(20,20,40,0.05),0_22px_42px_-22px_rgba(20,20,45,0.24)]",
        className,
      )}
      {...props}
    />
  );
}
