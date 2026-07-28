import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { CardGroupPositions } from "../CardGroupPositions";
import type { ScrutinGroupPositionData } from "@/lib/data/groupes";

const gp = (
  id: string,
  position: "POUR" | "CONTRE" | "ABSTENTION",
  code: string
): ScrutinGroupPositionData => ({
  id,
  position,
  forCount: 1,
  againstCount: 0,
  abstainCount: 0,
  cohesionPct: 90,
  group: {
    id: "g" + id,
    code,
    name: code + " nom",
    shortName: code,
    color: "#123456",
    slug: code.toLowerCase(),
  },
});

describe("CardGroupPositions", () => {
  it("rend le sigle des groupes (info en texte, pas seulement couleur)", () => {
    render(<CardGroupPositions positions={[gp("1", "POUR", "RE"), gp("2", "CONTRE", "RN")]} />);
    expect(screen.getAllByText("RE").length).toBeGreaterThan(0);
    expect(screen.getAllByText("RN").length).toBeGreaterThan(0);
  });

  it("expose des colonnes de position accessibles", () => {
    render(<CardGroupPositions positions={[gp("1", "POUR", "RE")]} />);
    expect(screen.getAllByRole("list", { name: /pour/i }).length).toBeGreaterThan(0);
  });

  it("rien si aucune position", () => {
    const { container } = render(<CardGroupPositions positions={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
