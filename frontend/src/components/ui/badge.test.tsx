import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./badge";

describe("Badge", () => {
  it("renders its tone and content", () => {
    render(<Badge tone="success">Verified</Badge>);

    const badge = screen.getByText("Verified");
    expect(badge).toHaveClass("bg-emerald-50", "text-emerald-700");
  });

  it("uses the neutral tone by default", () => {
    render(<Badge>Draft</Badge>);

    expect(screen.getByText("Draft")).toHaveClass("bg-muted");
  });

  it("renders a decorative dot when requested", () => {
    const { container } = render(
      <Badge tone="warning" dot>
        Disputed
      </Badge>,
    );

    const dot = container.querySelector("span span");
    expect(dot).not.toBeNull();
    expect(dot).toHaveAttribute("aria-hidden");
  });

  it("merges custom classes", () => {
    render(<Badge className="ml-2">Extra</Badge>);

    expect(screen.getByText("Extra")).toHaveClass("ml-2");
  });
});
