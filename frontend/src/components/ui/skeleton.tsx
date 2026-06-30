import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

// Consistent loading placeholder (see docs/09-frontend-pages.md loading states).
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}
