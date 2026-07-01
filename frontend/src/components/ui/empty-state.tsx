import type { ComponentType, ReactNode } from "react";

import { cn } from "@/lib/utils";

// Dashed-border empty state from the approved design: a soft framed panel with a
// brand-tinted icon chip, optional heading, supporting copy and an optional
// action. Reused on Projects, Home, Dashboard, project detail and admin tables.
const SIZES = {
  sm: {
    frame: "rounded-2xl px-8 py-9",
    chip: "size-10 rounded-xl [&_svg]:size-[19px]",
    title: "text-lg",
    gap: "gap-2",
  },
  lg: {
    frame: "rounded-[20px] px-8 py-[70px]",
    chip: "size-16 rounded-[18px] [&_svg]:size-[30px]",
    title: "text-[22px]",
    gap: "gap-2",
  },
} as const;

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = "lg",
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  title?: string;
  description?: string;
  action?: ReactNode;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center",
        "border-[1.5px] border-dashed border-[color-mix(in_oklch,var(--foreground)_14%,transparent)]",
        "bg-[color-mix(in_oklch,var(--card),var(--background)_35%)]",
        s.frame,
        s.gap,
        className,
      )}
    >
      <span
        className={cn(
          "mb-3 flex items-center justify-center bg-primary/10 text-primary",
          s.chip,
        )}
      >
        <Icon />
      </span>
      {title && (
        <h3 className={cn("font-display font-semibold", s.title)}>{title}</h3>
      )}
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
