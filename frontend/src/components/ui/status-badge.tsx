import { cn } from "@/lib/utils";

// Shared status pill for project/deployment statuses, so the colour language is
// consistent everywhere (see docs/09-frontend-pages.md). A leading dot reinforces
// the status at a glance and gently pulses while a deployment is in progress.
// Online = green, Failed = red, in-progress (Pending/Building/Deploying) = blue,
// Draft/unknown = muted.
type Tone = { pill: string; dot: string; pulse?: boolean };

const TONES: Record<string, Tone> = {
  Online: {
    pill: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  Failed: {
    pill: "border-destructive/25 bg-destructive/10 text-destructive",
    dot: "bg-destructive",
  },
  Pending: {
    pill: "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-400",
    dot: "bg-blue-500",
    pulse: true,
  },
  Building: {
    pill: "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-400",
    dot: "bg-blue-500",
    pulse: true,
  },
  Deploying: {
    pill: "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-400",
    dot: "bg-blue-500",
    pulse: true,
  },
};

const DEFAULT_TONE: Tone = {
  pill: "border-border bg-muted text-muted-foreground",
  dot: "bg-muted-foreground/60",
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const tone = TONES[status] ?? DEFAULT_TONE;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tone.pill,
        className,
      )}
    >
      <span className="relative flex size-1.5">
        {tone.pulse && (
          <span
            className={cn(
              "absolute inline-flex size-full animate-ping rounded-full opacity-60",
              tone.dot,
            )}
          />
        )}
        <span className={cn("relative inline-flex size-1.5 rounded-full", tone.dot)} />
      </span>
      {status}
    </span>
  );
}
