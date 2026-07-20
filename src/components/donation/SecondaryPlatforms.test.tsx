import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SecondaryPlatforms } from "./SecondaryPlatforms";

describe("SecondaryPlatforms", () => {
  it("rend Tipeee mais pas les plateformes désactivées sans url", () => {
    render(<SecondaryPlatforms />);
    expect(screen.getByText("Tipeee")).toBeInTheDocument();
    expect(screen.queryByText("GitHub Sponsors")).toBeNull();
    expect(screen.queryByText("Ko-fi")).toBeNull();
  });
});
