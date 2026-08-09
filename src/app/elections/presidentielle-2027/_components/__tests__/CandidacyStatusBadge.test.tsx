import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CandidacyStatusBadge } from "../CandidacyStatusBadge";

/**
 * Le contrôle avant merge que ces assertions verrouillent : « aucun aplat de couleur ne se répète
 * d'une ligne à l'autre de la liste ». Un seul des quatre états porte un fond plein, et c'est
 * celui qui distingue une candidature documentée des vingt autres. Si un second état passait en
 * `bg-primary`, le motif reviendrait et le nom du candidat repasserait au second plan.
 */
function pastille(over: Parameters<typeof CandidacyStatusBadge>[0]) {
  const { container } = render(<CandidacyStatusBadge {...over} />);
  return container.firstElementChild as HTMLElement;
}

describe("CandidacyStatusBadge", () => {
  it("réserve l'aplat plein à la candidature documentée", () => {
    const el = pastille({ status: "DECLARE", measureCount: 19, programmeAbsence: null });
    expect(el).toHaveTextContent("Déclarée · 19 mesures");
    expect(el.className).toContain("bg-primary");
  });

  it("laisse la déclarée non documentée en contour, jamais en aplat", () => {
    const el = pastille({ status: "DECLARE", measureCount: 0, programmeAbsence: "non_depouille" });
    expect(el).toHaveTextContent("Déclarée · non documenté");
    expect(el.className).toContain("border-primary");
    expect(el.className).not.toContain("bg-primary");
  });

  it("rend la pressentie en gris neutre, sans couleur d'alerte", () => {
    const el = pastille({
      status: "PRESSENTI",
      measureCount: 0,
      programmeAbsence: "aucun_programme",
    });
    expect(el).toHaveTextContent("Pressentie · aucun programme");
    expect(el.className).toContain("bg-muted");
    // `--brand` (rouge) reste réservé aux signaux judiciaires : un retard de programme n'en est pas un.
    expect(el.className).not.toContain("brand");
    expect(el.className).not.toContain("destructive");
  });

  it("rend la retirée en pointillés, sans fond", () => {
    const el = pastille({ status: "RETIRE", measureCount: 0, programmeAbsence: "aucun_programme" });
    expect(el).toHaveTextContent("Retirée");
    expect(el.className).toContain("border-dashed");
    expect(el.className).toContain("bg-transparent");
  });

  it("laisse le libellé respirer sur deux lignes plutôt que de le rogner", () => {
    // « Pressentie · aucun programme » passe sur deux lignes dans la colonne de 230 px. Avec une
    // `height` fixe, la seconde ligne sortirait de la pastille.
    const el = pastille({
      status: "PRESSENTI",
      measureCount: 0,
      programmeAbsence: "aucun_programme",
    });
    expect(el.className).toContain("min-h-[26px]");
    expect(el.className).not.toMatch(/(^|\s)h-\[?\d/);
  });

  it("ouvre la source quand elle existe et la nomme pour un lecteur d'écran", () => {
    render(
      <CandidacyStatusBadge
        status="DECLARE"
        measureCount={3}
        programmeAbsence={null}
        sourceUrl="https://example.org/declaration"
        sourceLabel="Le Monde, 4 juin 2026"
      />
    );
    const lien = screen.getByRole("link", { name: /Le Monde, 4 juin 2026/ });
    expect(lien).toHaveAttribute("href", "https://example.org/declaration");
    expect(lien).toHaveAttribute("title", "Le Monde, 4 juin 2026");
    // AGENTS.md §accessibilité : tout lien externe porte `noopener noreferrer`. `nofollow` s'y
    // ajoute parce que la destination est une source non maîtrisée.
    expect(lien).toHaveAttribute("rel", "nofollow noopener noreferrer");
    expect(lien).toHaveAttribute("target", "_blank");
    // Le nom accessible porte les deux : ce que dit la pastille ET où elle mène. Un lien nommé
    // « Déclarée · 3 mesures » qui ouvre un site externe sans dire lequel est la surprise à retirer.
    expect(lien).toHaveAccessibleName(
      "Déclarée · 3 mesures, source de la candidature : Le Monde, 4 juin 2026"
    );
  });

  it("garde une cible tactile de 44 px sur mobile dès qu'elle devient cliquable", () => {
    // La pastille est devenue le lien vers la source, donc elle tombe sous la règle des 44 px
    // (AGENTS.md). L'ancien lien de source portait `min-h-11` ; la perdre en fusionnant les deux
    // éléments serait une régression tactile déguisée en simplification visuelle.
    render(
      <CandidacyStatusBadge
        status="DECLARE"
        measureCount={3}
        programmeAbsence={null}
        sourceUrl="https://example.org/declaration"
        sourceLabel="Le Monde"
      />
    );
    const lien = screen.getByRole("link");
    expect(lien.className).toContain("min-h-11");
    expect(lien.className).toContain("lg:min-h-[26px]");

    // La géométrie de la maquette tient quand même : l'aplat coloré reste une pastille de 26 px,
    // c'est la zone de contact qui grandit autour d'elle.
    const aplat = lien.querySelector("span");
    expect(aplat?.className).toContain("min-h-[26px]");
    expect(aplat?.className).toContain("rounded-full");
    expect(lien.className).not.toContain("rounded-full");
  });

  it("reste un simple texte quand la source manque, jamais un lien mort", () => {
    render(<CandidacyStatusBadge status="DECLARE" measureCount={3} programmeAbsence={null} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Déclarée · 3 mesures")).toBeInTheDocument();
  });
});
