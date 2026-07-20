import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SecondaryPlatformLink } from "./SecondaryPlatformLink";

vi.mock("@/lib/umami", () => ({ trackUmami: vi.fn() }));
import { trackUmami } from "@/lib/umami";

describe("SecondaryPlatformLink", () => {
  it("track l'event donation_platform_click au clic", async () => {
    render(
      <SecondaryPlatformLink
        platformId="tipeee"
        url="https://fr.tipeee.com/poligraph"
        displayName="Tipeee"
      />
    );
    await userEvent.click(screen.getByRole("link", { name: /soutenir sur tipeee/i }));
    expect(trackUmami).toHaveBeenCalledTimes(1);
    expect(trackUmami).toHaveBeenCalledWith("donation_platform_click", { platform: "tipeee" });
  });
});
