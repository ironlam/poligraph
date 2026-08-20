import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/liaisons/articles-affaires",
}));

import { ArticleAffairWorkbench } from "@/components/admin/ArticleAffairWorkbench";
import { AffairPoliticianWorkbench } from "@/components/admin/AffairPoliticianWorkbench";

describe("relationship workbenches", () => {
  it("exposes the article to affair workflow and its empty search context", () => {
    render(<ArticleAffairWorkbench />);
    expect(screen.getByRole("heading", { name: "Articles ↔ affaires" })).toBeInTheDocument();
    expect(screen.queryByText(/aucune relation/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Article de presse")).toBeInTheDocument();
  });

  it("exposes the explicit reassignment workflow and the automatic history link", () => {
    render(<AffairPoliticianWorkbench />);
    expect(screen.getByRole("heading", { name: "Affaires ↔ personnalités" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ouvrir la file automatique" })).toHaveAttribute(
      "href",
      "/admin/affair-matching/review"
    );
    expect(screen.getByLabelText("Affaire")).toBeInTheDocument();
  });
});
