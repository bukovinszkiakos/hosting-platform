import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Logo } from "@/components/ui/logo";

// Centered authentication layout from the approved design: a full-height surface
// with a brand glow + masked dot-grid backdrop, a back-to-home link, the brand
// mark, a heading/subtitle, a card slot for the form, and an optional footer
// link. Shared by the Login and Register pages.
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen animate-fade-in items-center justify-center overflow-hidden px-5 py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-hero-glow" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid-mask" />

      <Link
        href="/"
        className="absolute left-7 top-6 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Home
      </Link>

      <div className="relative w-full max-w-[412px]">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size="xl" className="mb-4" />
          <h1 className="font-display text-3xl font-bold">{title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
        </div>

        <div className="rounded-[18px] border border-border bg-card p-7 shadow-xl">
          {children}
        </div>

        {footer && (
          <p className="mt-5 text-center text-sm text-muted-foreground">{footer}</p>
        )}
      </div>
    </div>
  );
}
