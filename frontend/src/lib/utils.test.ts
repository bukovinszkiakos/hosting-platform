import { describe, expect, it } from "vitest";

import { initials } from "@/lib/utils";

describe("initials", () => {
  it("returns a placeholder for empty or missing input", () => {
    expect(initials(null)).toBe("?");
    expect(initials(undefined)).toBe("?");
    expect(initials("")).toBe("?");
    expect(initials("   ")).toBe("?");
  });

  it("uses the first two letters of a single-word value", () => {
    expect(initials("Alice")).toBe("AL");
  });

  it("combines the first and last token for multi-word names", () => {
    expect(initials("Alice Smith")).toBe("AS");
    expect(initials("Alice B Smith")).toBe("AS");
  });

  it("falls back to the first two characters for an email address", () => {
    expect(initials("john.doe@example.com")).toBe("JO");
  });

  it("always upper-cases the result", () => {
    expect(initials("bob jones")).toBe("BJ");
  });
});
