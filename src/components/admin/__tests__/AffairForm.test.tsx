import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

import { AffairForm } from "@/components/admin/AffairForm";

const POLITICIANS = [{ id: "pol_1", fullName: "Jean Testeur", slug: "jean-testeur" }];

// `initialData` bypasses the component's own defaults, so the shape has to be complete.
const BASE = {
  politicianId: "pol_1",
  title: "Affaire de test",
  description: "Description de test",
  status: "CONDAMNATION_DEFINITIVE",
  category: "AUTRE",
  involvement: "DIRECT",
  appeal: false,
  linkedAffairId: null,
  sources: [
    {
      url: "https://example.test/a",
      title: "Source",
      publisher: "Example",
      publishedAt: "2026-01-01",
      excerpt: "",
      sourceType: "MANUAL",
    },
  ],
};

/**
 * Issue #576 — the firm part of a term has a meaningful zero.
 *
 * The form's prevailing idiom is `value={formData.x || ""}`, which renders 0 as an empty
 * field. Applied to this column it would show « non établie » for the 46 fiches whose
 * sentence is entirely suspended, and the next save would write that back as null. The
 * loss goes toward "not established", so it understates rather than overstates, which is
 * why the column stores the firm part and not the suspended one.
 */
describe("AffairForm — part ferme (#576)", () => {
  it("affiche 0 au lieu d'un champ vide", () => {
    render(
      <AffairForm
        politicians={POLITICIANS}
        initialData={{ ...BASE, prisonMonths: 48, prisonFirmMonths: 0 } as never}
      />
    );

    expect(screen.getByLabelText("Prison, part non assortie du sursis (mois)")).toHaveValue(0);
  });

  it("laisse le champ vide quand la répartition n'est pas établie", () => {
    render(
      <AffairForm
        politicians={POLITICIANS}
        initialData={{ ...BASE, prisonMonths: 48, prisonFirmMonths: null } as never}
      />
    );

    expect(screen.getByLabelText("Prison, part non assortie du sursis (mois)")).toHaveValue(null);
  });

  it("distingue les deux états sur l'inéligibilité aussi", () => {
    const { unmount } = render(
      <AffairForm
        politicians={POLITICIANS}
        initialData={{ ...BASE, ineligibilityMonths: 45, ineligibilityFirmMonths: 0 } as never}
      />
    );
    expect(screen.getByLabelText("Inéligibilité, part non assortie du sursis (mois)")).toHaveValue(
      0
    );
    unmount();

    render(
      <AffairForm
        politicians={POLITICIANS}
        initialData={{ ...BASE, ineligibilityMonths: 45, ineligibilityFirmMonths: null } as never}
      />
    );
    expect(screen.getByLabelText("Inéligibilité, part non assortie du sursis (mois)")).toHaveValue(
      null
    );
  });
});
