import { cn } from "@/lib/utils";

// Shared status pill for project/deployment statuses, so the colour language is
// consistent everywhere (see docs/09-frontend-pages.md). Online = green,
// Failed = red, in-progress (Pending/Building/Deploying) = blue, Draft/unknown = muted.
const TONES: Record<string, string> = {
  Online: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  Failed: "border-destructive/30 bg-destructive/10 text-destructive",
  Pending: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  Building: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  Deploying: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
};

const DEFAULT_TONE = "border-border bg-muted text-muted-foreground";

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        TONES[status] ?? DEFAULT_TONE,
        className,
      )}
    >
      {status}
    </span>
  );
}
