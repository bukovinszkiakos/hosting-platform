"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, Rocket, X } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { navItemsForRole } from "@/components/layout/nav-items";
import { Button } from "@/components/ui/button";
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
    <header className="sticky top-0 z-30 flex h-16 items-center border-b border-border bg-background/80 px-4 backdrop-blur-md md:px-6">
      <Link href="/home" className="flex items-center gap-2.5 md:hidden">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Rocket className="size-4.5" />
        </span>
        <span className="text-[0.95rem] font-semibold tracking-tight">
          Hosting Platform
        </span>
      </Link>

      <div className="ml-auto flex items-center gap-3">
        {user && (
          <div className="flex items-center gap-2.5">
            <span className="hidden text-right text-sm leading-tight sm:block">
              <span className="block font-medium">{user.displayName}</span>
              <span className="block text-xs text-muted-foreground">
                {user.role}
              </span>
            </span>
            <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
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
        <div className="absolute inset-x-0 top-16 z-20 border-b border-border bg-background p-3 shadow-lg md:hidden">
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
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon
                    className={cn("size-4.5", active && "text-primary")}
                  />
                  {item.label}
                </Link>
              );
            })}
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <LogOut className="size-4.5" />
              {loggingOut ? "Signing out…" : "Log out"}
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}
