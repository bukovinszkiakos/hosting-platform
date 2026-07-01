"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { navItemsForRole } from "@/components/layout/nav-items";
import { Logo } from "@/components/ui/logo";
import { cn, initials } from "@/lib/utils";

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
    <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      <Link href="/home" className="flex items-center gap-3 px-5 py-5">
        <Logo size="md" />
        <span className="font-display text-[16.5px] font-bold tracking-tight">
          Hosting Platform
        </span>
      </Link>

      <nav className="flex flex-1 flex-col gap-0.5 px-3.5 py-2">
        <p className="px-3 pb-2 pt-2 text-[0.7rem] font-bold uppercase tracking-[0.13em] text-faint">
          Menu
        </p>
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
                "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[15px] font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--sidebar-primary),white_76%)]"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-[19px]" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3.5">
        {user && (
          <div className="flex items-center gap-3 rounded-[11px] px-2.5 py-2">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-primary/10 text-xs font-bold text-primary">
              {initials(user.displayName)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user.displayName}</p>
              <p className="truncate text-xs text-faint">{user.email}</p>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="mt-1.5 flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
        >
          <LogOut className="size-[18px]" />
          {loggingOut ? "Signing out…" : "Log out"}
        </button>
      </div>
    </aside>
  );
}
