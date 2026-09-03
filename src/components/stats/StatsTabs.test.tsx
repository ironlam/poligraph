import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatsTabs } from "./StatsTabs";
import { STATS_TABS, statsHref, type StatsTab } from "@/config/routes";

describe("StatsTabs", () => {
  it.each(STATS_TABS)("links to the server-rendered %s section", (tab: StatsTab) => {
    render(
      <StatsTabs active={tab}>
        <p>Contenu actif</p>
      </StatsTabs>
    );

    const activeLink = screen.getByRole("link", { current: "page" });
    expect(activeLink).toHaveAttribute("href", statsHref(tab));
    expect(screen.getAllByRole("link")).toHaveLength(STATS_TABS.length);
    expect(screen.getByText("Contenu actif")).toBeInTheDocument();
  });

  it("keeps the chamber on the participation URL", () => {
    expect(statsHref("participation", { chamber: "AN" })).toBe(
      "/statistiques/participation?chamber=AN"
    );
  });
});
