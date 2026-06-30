import type { ComponentType } from "react";
import {
  FolderGit2,
  House,
  LayoutDashboard,
  Shield,
  User,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  adminOnly?: boolean;
};

// Single source of truth for the primary navigation, shared by the desktop
// Sidebar and the mobile menu in TopNav (see docs/09-frontend-pages.md "Navigation").
export const NAV_ITEMS: NavItem[] = [
  { href: "/home", label: "Home", icon: House },
  { href: "/projects", label: "Projects", icon: FolderGit2 },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/admin", label: "Admin", icon: Shield, adminOnly: true },
];

export function navItemsForRole(isAdmin: boolean): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
}
