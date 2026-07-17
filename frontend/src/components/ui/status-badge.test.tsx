import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StatusBadge } from "@/components/ui/status-badge";

afterEach(cleanup);

describe("StatusBadge", () => {
  it("renders the status text and the terminal 'Online' (green) variant without a pulse", () => {
    const { container } = render(<StatusBadge status="Online" />);

    const badge = screen.getByText("Online");
    expect(badge).toBeInTheDocument();
    // Green tone on the pill.
    expect(badge).toHaveClass("bg-emerald-500/10", "text-emerald-700");
    // Solid dot, no pulsing overlay for a terminal status.
    expect(container.querySelector(".bg-emerald-500")).not.toBeNull();
    expect(container.querySelector(".animate-ping")).toBeNull();
  });

  it("renders the destructive (red) variant for 'Failed'", () => {
    const { container } = render(<StatusBadge status="Failed" />);

    expect(screen.getByText("Failed")).toHaveClass("bg-destructive/10", "text-destructive");
    expect(container.querySelector(".animate-ping")).toBeNull();
  });

  it("renders the in-progress (blue) variant with a pulsing dot for 'Building'", () => {
    const { container } = render(<StatusBadge status="Building" />);

    expect(screen.getByText("Building")).toHaveClass("bg-blue-500/10", "text-blue-700");
    // In-progress statuses pulse.
    expect(container.querySelector(".animate-ping")).not.toBeNull();
  });

  it("falls back to the muted default variant for an unknown status", () => {
    const { container } = render(<StatusBadge status="Draft" />);

    expect(screen.getByText("Draft")).toHaveClass("bg-muted", "text-muted-foreground");
    expect(container.querySelector(".animate-ping")).toBeNull();
  });

  it("merges a caller-provided className", () => {
    render(<StatusBadge status="Online" className="mt-4" />);

    expect(screen.getByText("Online")).toHaveClass("mt-4");
  });
});
