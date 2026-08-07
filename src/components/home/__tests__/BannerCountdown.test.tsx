import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BannerCountdown } from "@/components/home/BannerCountdown";

describe("BannerCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rend trois unités quand les secondes ne sont pas demandées", () => {
    render(
      <BannerCountdown
        targetDate="2027-04-11T06:00:00.000Z"
        showSeconds={false}
        label="Compte à rebours jusqu'au premier tour"
      />
    );

    expect(screen.getByText("jours")).toBeInTheDocument();
    expect(screen.getByText("heures")).toBeInTheDocument();
    expect(screen.getByText("minutes")).toBeInTheDocument();
    expect(screen.queryByText("secondes")).not.toBeInTheDocument();
  });

  it("rend les secondes quand elles sont demandées", () => {
    render(
      <BannerCountdown
        targetDate="2026-08-07T18:00:00.000Z"
        showSeconds
        label="Fermeture des bureaux"
      />
    );

    expect(screen.getByText("secondes")).toBeInTheDocument();
  });

  it("expose un role timer avec son libellé", () => {
    render(
      <BannerCountdown
        targetDate="2027-04-11T06:00:00.000Z"
        showSeconds={false}
        label="Compte à rebours jusqu'au premier tour"
      />
    );

    expect(
      screen.getByRole("timer", { name: "Compte à rebours jusqu'au premier tour" })
    ).toBeInTheDocument();
  });

  it("réserve la place avant montage au lieu de ne rien rendre", () => {
    // The homepage is ISR-cached for 300 s, so hours and minutes cannot be rendered on the server
    // without diverging at hydration. The skeleton keeps the layout stable instead of collapsing
    // the tallest card on the page.
    const { container } = render(
      <BannerCountdown
        targetDate="2027-04-11T06:00:00.000Z"
        showSeconds={false}
        label="Compte à rebours"
      />
    );

    expect(container.firstChild).not.toBeNull();
  });

  it("n'affiche jamais de valeur négative une fois la cible passée", () => {
    render(
      <BannerCountdown
        targetDate="2026-01-01T00:00:00.000Z"
        showSeconds={false}
        label="Cible passée"
      />
    );

    expect(screen.queryByText(/-/)).not.toBeInTheDocument();
  });
});
