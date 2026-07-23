import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PoliticianSignals } from "@/components/politicians/PoliticianSignals";
import type { Signal } from "@/lib/politicians/signals";

const signal = (over: Partial<Signal>): Signal => ({
  key: "mandats",
  iconKey: "mandate",
  label: "Mandats",
  value: "8",
  href: "/politiques/x?tab=carriere",
  tone: "neutral",
  primary: true,
  ...over,
});

describe("PoliticianSignals", () => {
  it("renders primary signals as links with label + value", () => {
    render(<PoliticianSignals signals={[signal({})]} />);
    const link = screen.getByRole("link", { name: /Mandats/ });
    expect(link).toHaveAttribute("href", "/politiques/x?tab=carriere");
    expect(link).toHaveTextContent("8");
  });

  it("does not render non-primary signals as cards", () => {
    render(
      <PoliticianSignals
        signals={[signal({ key: "mentionne", label: "Mentionné / secondaire", primary: false })]}
      />
    );
    expect(screen.queryByRole("link", { name: /Mentionné/ })).toBeNull();
  });
});
