import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ThemeFocusRadar, computeAxisCoordinates, computeVertex } from "./ThemeFocusRadar";

describe("computeAxisCoordinates", () => {
  it("places the first axis at the top (12 o'clock)", () => {
    const [x, y] = computeAxisCoordinates(0, 5, 80);
    expect(x).toBeCloseTo(0, 5);
    expect(y).toBeCloseTo(-80, 5);
  });

  it("returns 5 axes evenly spaced at 72 degrees", () => {
    const positions = [0, 1, 2, 3, 4].map((i) => computeAxisCoordinates(i, 5, 80));
    expect(positions[1]![0]).toBeCloseTo(76.084, 2);
    expect(positions[1]![1]).toBeCloseTo(-24.721, 2);
    expect(positions[4]![0]).toBeCloseTo(-76.084, 2);
    expect(positions[4]![1]).toBeCloseTo(-24.721, 2);
  });
});

describe("computeVertex", () => {
  it("scales the polygon vertex by count / maxCount", () => {
    const [x, y] = computeVertex(0, 5, 80, 2, 4);
    expect(x).toBeCloseTo(0, 5);
    expect(y).toBeCloseTo(-40, 5);
  });

  it("hits the axis tip when count equals maxCount", () => {
    const [x, y] = computeVertex(0, 5, 80, 4, 4);
    expect(x).toBeCloseTo(0, 5);
    expect(y).toBeCloseTo(-80, 5);
  });
});

describe("ThemeFocusRadar component", () => {
  it("renders the empty state when no items are provided", () => {
    const { getByText } = render(<ThemeFocusRadar items={[]} candidateName="Test" />);
    expect(getByText(/Trop peu de promesses/i)).toBeInTheDocument();
  });

  it("renders the empty state when only one theme has at least one promise", () => {
    const { getByText } = render(
      <ThemeFocusRadar items={[{ theme: "ECONOMIE_BUDGET", count: 4 }]} candidateName="Test" />
    );
    expect(getByText(/Trop peu de promesses/i)).toBeInTheDocument();
  });

  it("renders the SVG and the textual top list when 2+ themes are present", () => {
    const { container, getAllByText } = render(
      <ThemeFocusRadar
        items={[
          { theme: "INSTITUTIONS", count: 4 },
          { theme: "ECONOMIE_BUDGET", count: 3 },
        ]}
        candidateName="Mélenchon"
      />
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(getAllByText(/Institutions/).length).toBeGreaterThan(0);
    expect(getAllByText(/Économie et budget/).length).toBeGreaterThan(0);
  });
});
