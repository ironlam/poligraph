import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AffairTimeline } from "./AffairTimeline";

const mockEvents = [
  {
    id: "1",
    identityKey: null,
    affairId: "affair-1",
    date: new Date("2020-01-15"),
    type: "REVELATION" as const,
    title: "Révélation dans la presse",
    description: "Article de Mediapart",
    sourceUrl: "https://mediapart.fr/article",
    sourceTitle: "Mediapart",
    createdAt: new Date(),
  },
  {
    id: "2",
    identityKey: null,
    affairId: "affair-1",
    date: new Date("2020-06-20"),
    type: "MISE_EN_EXAMEN" as const,
    title: "Mise en examen",
    description: null,
    sourceUrl: null,
    sourceTitle: null,
    createdAt: new Date(),
  },
  {
    id: "3",
    identityKey: null,
    affairId: "affair-1",
    date: new Date("2021-03-10"),
    type: "CONDAMNATION" as const,
    title: "Condamnation en première instance",
    description: "2 ans avec sursis",
    sourceUrl: null,
    sourceTitle: null,
    createdAt: new Date(),
  },
];

describe("AffairTimeline", () => {
  it("should render nothing when events array is empty", () => {
    const { container } = render(<AffairTimeline events={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("should render chronology title", () => {
    render(<AffairTimeline events={mockEvents} />);
    expect(screen.getByText("Chronologie")).toBeInTheDocument();
  });

  it("should render all events", () => {
    render(<AffairTimeline events={mockEvents} />);
    expect(screen.getByText("Révélation dans la presse")).toBeInTheDocument();
    // "Mise en examen" appears both as event title and type label
    expect(screen.getAllByText("Mise en examen").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Condamnation en première instance")).toBeInTheDocument();
  });

  it("should render event type labels", () => {
    render(<AffairTimeline events={mockEvents} />);
    expect(screen.getByText("Révélation médiatique")).toBeInTheDocument();
    // "Mise en examen" appears both as title and type label, so check for at least one
    expect(screen.getAllByText("Mise en examen").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Condamnation")).toBeInTheDocument();
  });

  it("should render event descriptions when present", () => {
    render(<AffairTimeline events={mockEvents} />);
    expect(screen.getByText("Article de Mediapart")).toBeInTheDocument();
    expect(screen.getByText("2 ans avec sursis")).toBeInTheDocument();
  });

  it("should render source links when present", () => {
    render(<AffairTimeline events={mockEvents} />);
    const link = screen.getByRole("link", { name: /Mediapart/i });
    expect(link).toHaveAttribute("href", "https://mediapart.fr/article");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("should sort events by date (oldest first)", () => {
    const unsortedEvents = [mockEvents[2]!, mockEvents[0]!, mockEvents[1]!];
    render(<AffairTimeline events={unsortedEvents} />);

    const titles = screen.getAllByRole("listitem");
    expect(titles[0]).toHaveTextContent("Révélation dans la presse");
    expect(titles[1]).toHaveTextContent("Mise en examen"); // Title matches
    expect(titles[2]).toHaveTextContent("Condamnation en première instance");
  });

  it("should render numbered indicators", () => {
    render(<AffairTimeline events={mockEvents} />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});
