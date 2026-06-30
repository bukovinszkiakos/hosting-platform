"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, Rocket, X } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { navItemsForRole } from "@/components/layout/nav-items";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Top navigation bar (see docs/09-frontend-pages.md "Layout Structure" and
// "Navigation"). On desktop the sidebar carries navigation + logout, so the bar
// just shows the signed-in user. On small screens the sidebar is hidden, so the
// bar provides the brand, a menu toggle (navigation + logout), and the user.
export function TopNav() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const items = navItemsForRole(user?.role === "Admin");

  async function handleLogout() {
    setMenuOpen(false);
    setLoggingOut(true);
    try {
      await logout();
      router.replace("/login");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <header className="relative flex h-14 items-center border-b border-border bg-background px-4 md:px-6">
      <Link href="/home" className="flex items-center gap-2 md:hidden">
        <Rocket className="size-5 text-primary" />
        <span className="text-base font-semibold">Hosting Platform</span>
      </Link>

      <div className="ml-auto flex items-center gap-3">
        {user && (
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {user.displayName}
          </span>
        )}

        {/* Navigation + logout live in the sidebar on desktop; expose them here on mobile. */}
        <Button
          variant="ghost"
          size="icon-sm"
          className="md:hidden"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X /> : <Menu />}
        </Button>
      </div>

      {menuOpen && (
        <div className="absolute inset-x-0 top-14 z-20 border-b border-border bg-background p-3 shadow-sm md:hidden">
          <nav className="flex flex-col gap-1">
            {items.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <LogOut className="size-4" />
              {loggingOut ? "Signing out…" : "Log out"}
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}
