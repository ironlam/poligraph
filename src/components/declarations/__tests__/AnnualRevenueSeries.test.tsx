import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnnualRevenueSeries } from "@/components/declarations/AnnualRevenueSeries";

describe("AnnualRevenueSeries", () => {
  it("renders one visible year:amount per present year, no gap-filling", () => {
    render(
      <AnnualRevenueSeries
        revenues={[
          { year: 2017, amount: 39655 },
          { year: 2019, amount: 71416 },
        ]}
      />
    );
    expect(screen.getByText("2017")).toBeInTheDocument();
    expect(screen.getByText("2019")).toBeInTheDocument();
    expect(screen.queryByText("2018")).toBeNull();
  });

  it("shows a named period total", () => {
    render(
      <AnnualRevenueSeries
        revenues={[
          { year: 2017, amount: 39655 },
          { year: 2019, amount: 71416 },
        ]}
      />
    );
    expect(screen.getByText(/Total déclaré sur la période/)).toBeInTheDocument();
    expect(screen.getByText(/111\s?071/)).toBeInTheDocument();
  });

  it("shows a real zero as 0 €", () => {
    render(<AnnualRevenueSeries revenues={[{ year: 2020, amount: 0 }]} />);
    // "0 €" appears both in the year line and the period total (both are 0).
    expect(screen.getAllByText(/0\s?€/).length).toBeGreaterThan(0);
  });

  it("renders nothing for empty input", () => {
    const { container } = render(<AnnualRevenueSeries revenues={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
