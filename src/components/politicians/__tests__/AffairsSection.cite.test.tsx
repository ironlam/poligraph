import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { AffairsSection } from "@/components/politicians/AffairsSection";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Minimal victim affair; unrelated optional fields omitted on purpose.
// involvement/category use real Prisma enum values (VICTIM / AUTRE), not the
// brief's placeholder "VICTIME" / "OTHER", so the victim branch actually renders.
const victimAffair = {
  id: "v1",
  slug: "affaire-victime",
  title: "Affaire victime",
  description: "desc",
  category: "AUTRE",
  status: "RELAXE",
  involvement: "VICTIM",
  factsDate: null,
  startDate: null,
  verdictDate: null,
  sources: [],
  events: [],
  linkedAffair: null,
  linkedBy: null,
};

describe("AffairsSection — ancre de copie sur les victimes", () => {
  it("rend l'id d'ancre et le bouton CiteAnchor pour une affaire victime", () => {
    const { container } = render(
      <AffairsSection affairs={[victimAffair] as never} civility={null} />
    );
    expect(container.querySelector("#affair-v1")).not.toBeNull();
    expect(
      container.querySelector('#affair-v1 a[aria-label="Copier le lien vers cette affaire"]')
    ).not.toBeNull();
  });
});
