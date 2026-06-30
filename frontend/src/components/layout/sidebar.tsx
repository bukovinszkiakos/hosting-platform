"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, Rocket } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { navItemsForRole } from "@/components/layout/nav-items";
import { cn } from "@/lib/utils";

export function Sidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const items = navItemsForRole(isAdmin);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      router.replace("/login");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      <Link
        href="/home"
        className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4"
      >
        <Rocket className="size-5 text-sidebar-primary" />
        <span className="text-base font-semibold">Hosting Platform</span>
      </Link>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        {user && (
          <div className="px-1 pb-2">
            <p className="truncate text-sm font-medium">{user.displayName}</p>
            <p className="truncate text-xs text-sidebar-foreground/60">{user.email}</p>
          </div>
        )}
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          <LogOut className="size-4" />
          {loggingOut ? "Signing out…" : "Log out"}
        </button>
      </div>
    </aside>
  );
}
