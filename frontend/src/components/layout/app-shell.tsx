import type { ReactNode } from "react";

import { Sidebar } from "@/components/layout/sidebar";
import { TopNav } from "@/components/layout/top-nav";

// Shared layout for protected pages: Sidebar + Top Navigation + Page Content
// (see docs/09-frontend-pages.md "Layout Structure"). Protected pages wrap their
// content in this shell. Admin state is read from the auth context inside the
// navigation components, so pages do not pass it in.
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav />
        <main className="flex-1 px-4 py-8 md:px-10 md:py-11">
          <div className="mx-auto w-full max-w-[1120px] animate-fade-up">{children}</div>
        </main>
      </div>
    </div>
  );
}
