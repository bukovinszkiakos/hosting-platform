import { Rocket } from "lucide-react";

import { cn } from "@/lib/utils";

// The gradient brand mark (rounded square + rocket glyph) from the approved
// design. Shared by the Sidebar, TopNav, AuthShell, landing header and footer so
// the wordmark stays consistent everywhere (see docs/12 "Design System").
const SIZES = {
  sm: { box: "size-[26px] rounded-[7px]", icon: "size-3.5" },
  md: { box: "size-8 rounded-[9px]", icon: "size-[17px]" },
  lg: { box: "size-[34px] rounded-[9px]", icon: "size-[18px]" },
  xl: { box: "size-[52px] rounded-[14px]", icon: "size-[26px]" },
} as const;

export function Logo({
  size = "md",
  className,
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center text-white",
        "bg-[linear-gradient(150deg,var(--brand),color-mix(in_oklch,var(--brand),black_24%))]",
        "shadow-[0_5px_14px_-4px_color-mix(in_oklch,var(--brand)_55%,transparent)]",
        s.box,
        className,
      )}
    >
      <Rocket className={s.icon} strokeWidth={2} />
    </span>
  );
}
