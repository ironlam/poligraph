import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SecondaryPlatforms } from "./SecondaryPlatforms";

describe("SecondaryPlatforms", () => {
  it("rend les plateformes actives (Tipeee, Ko-fi) mais pas les désactivées", () => {
    render(<SecondaryPlatforms />);
    expect(screen.getByText("Tipeee")).toBeInTheDocument();
    expect(screen.getByText("Ko-fi")).toBeInTheDocument();
    expect(screen.queryByText("GitHub Sponsors")).toBeNull();
  });
});
