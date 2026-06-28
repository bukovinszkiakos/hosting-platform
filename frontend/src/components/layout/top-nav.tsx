import Link from "next/link";
import { Rocket } from "lucide-react";

// Top navigation bar (see docs/09-frontend-pages.md "Layout Structure").
// On small screens the sidebar is hidden, so the brand is shown here instead.
// User/account actions are added together with authentication (later tasks).
export function TopNav() {
  return (
    <header className="flex h-14 items-center border-b border-border bg-background px-4 md:px-6">
      <Link href="/home" className="flex items-center gap-2 md:hidden">
        <Rocket className="size-5 text-primary" />
        <span className="text-base font-semibold">Hosting Platform</span>
      </Link>
      <div className="ml-auto" />
    </header>
  );
}
