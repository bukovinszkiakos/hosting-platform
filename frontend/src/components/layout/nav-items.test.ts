import { describe, expect, it } from "vitest";

import { NAV_ITEMS, navItemsForRole } from "@/components/layout/nav-items";

describe("navItemsForRole", () => {
  it("hides admin-only items from non-admin users", () => {
    const items = navItemsForRole(false);
    expect(items.some((item) => item.adminOnly)).toBe(false);
    expect(items.map((item) => item.href)).not.toContain("/admin");
  });

  it("includes admin-only items for admin users", () => {
    const items = navItemsForRole(true);
    expect(items).toHaveLength(NAV_ITEMS.length);
    expect(items.map((item) => item.href)).toContain("/admin");
  });

  it("always includes the shared (non-admin) items for both roles", () => {
    const shared = NAV_ITEMS.filter((item) => !item.adminOnly).map((item) => item.href);
    for (const items of [navItemsForRole(false), navItemsForRole(true)]) {
      const hrefs = items.map((item) => item.href);
      expect(hrefs).toEqual(expect.arrayContaining(shared));
    }
  });
});
