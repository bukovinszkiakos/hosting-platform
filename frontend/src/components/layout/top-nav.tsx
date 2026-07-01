"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { navItemsForRole } from "@/components/layout/nav-items";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { cn, initials } from "@/lib/utils";

// Top navigation bar (see docs/09-frontend-pages.md "Layout Structure" and
// "Navigation"). On desktop the sidebar carries navigation + logout, so the bar
// shows the signed-in user. On small screens the sidebar is hidden, so the bar
// provides the brand, a menu toggle (navigation + logout), and the user avatar.
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
    <header className="sticky top-0 z-30 flex h-[66px] items-center border-b border-border px-4 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70 md:px-10">
      <Link href="/home" className="flex items-center gap-2.5 md:hidden">
        <Logo size="md" />
        <span className="font-display text-[0.95rem] font-bold tracking-tight">
          Hosting Platform
        </span>
      </Link>

      <div className="ml-auto flex items-center gap-3">
        {user && (
          <div className="flex items-center gap-3">
            <span className="hidden text-right leading-tight sm:block">
              <span className="block text-sm font-semibold">{user.displayName}</span>
              <span className="block text-[12.5px] text-faint">{user.role}</span>
            </span>
            <span className="flex size-9 items-center justify-center rounded-[10px] bg-primary/10 text-xs font-bold text-primary shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary),white_76%)]">
              {initials(user.displayName)}
            </span>
          </div>
        )}

        {/* Navigation + logout live in the sidebar on desktop; expose them here on mobile. */}
        <Button
          variant="outline"
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
        <div className="absolute inset-x-0 top-[66px] z-20 border-b border-border bg-background p-3 shadow-lg md:hidden">
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
                    "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-[19px]" />
                  {item.label}
                </Link>
              );
            })}
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
            >
              <LogOut className="size-[18px]" />
              {loggingOut ? "Signing out…" : "Log out"}
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}
