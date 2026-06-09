import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "@/components/legislation/StatusBadge";
import type { DossierStatus } from "@/generated/prisma";

describe("StatusBadge", () => {
  it("affiche le label correspondant au statut", () => {
    render(<StatusBadge status="ADOPTE" />);
    expect(screen.getByText("Adopté")).toBeInTheDocument();
  });

  it("rend tous les statuts de l'enum sans crash", () => {
    const cases: [DossierStatus, string][] = [
      ["DEPOSE", "Déposé"],
      ["EN_COMMISSION", "En commission"],
      ["EN_COURS", "En discussion"],
      ["CONSEIL_CONSTITUTIONNEL", "Conseil constitutionnel"],
      ["ADOPTE", "Adopté"],
      ["REJETE", "Rejeté"],
      ["RETIRE", "Retiré"],
      ["CADUQUE", "Caduc"],
    ];
    cases.forEach(([status, label]) => {
      const { unmount } = render(<StatusBadge status={status} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    });
  });

  it("affiche une icône quand showIcon est activé", () => {
    render(<StatusBadge status="ADOPTE" showIcon />);
    expect(screen.getByText("✅")).toBeInTheDocument();
  });
});
