import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import type { ParrainageLigne } from "@/lib/data/parrainages";
import { ParrainagesCommune, ParrainagesDepartement } from "../ParrainagesTerritoire";

const SLUG = "presidentielle-2022";
const ligne = (over: Partial<ParrainageLigne> = {}): ParrainageLigne => ({
  id: "p-1",
  civility: "M.",
  firstName: "Michel",
  lastName: "FOURCADE",
  mandateLabel: "Maire",
  constituencyLabel: "Pierrefitte-sur-Seine",
  departmentLabel: "Seine-Saint-Denis",
  departmentCode: "93",
  communeCode: "93066",
  candidateName: "HIDALGO Anne",
  publishedOn: "2022-02-01",
  politicianSlug: null,
  ...over,
});
const text = (container: HTMLElement) => (container.textContent ?? "").replace(/\s+/g, " ");

describe("ParrainagesCommune", () => {
  it("ne rend rien quand la commune n'a aucune présentation publiée", () => {
    expect(render(<ParrainagesCommune blocs={[]} />).container.innerHTML).toBe("");
    const inconnue = [{ electionSlug: "presidentielle-1965", lignes: [ligne()] }];
    expect(render(<ParrainagesCommune blocs={inconnue} />).container.innerHTML).toBe("");
  });

  it("écrit « a présenté », avec la commune telle que publiée et la date de publication", () => {
    const { container } = render(
      <ParrainagesCommune blocs={[{ electionSlug: SLUG, lignes: [ligne()] }]} />
    );
    expect(text(container)).toContain(
      "Michel FOURCADE (Maire, Pierrefitte-sur-Seine) a présenté HIDALGO Anne (publié le 1er février 2022)."
    );
    expect(text(container)).toContain("Présidentielle 2022");
    expect(
      container.querySelector('a[href="/elections/presidentielle-2022/parrainages/hidalgo-anne"]')
        ?.textContent
    ).toBe("HIDALGO Anne");
  });

  it("ne relie l'élu à une fiche que si le lien est établi", () => {
    const lignes = [
      ligne(),
      ligne({ id: "p-2", lastName: "MARTIN", politicianSlug: "claire-martin" }),
    ];
    const { container } = render(<ParrainagesCommune blocs={[{ electionSlug: SLUG, lignes }]} />);
    const fiches = [...container.querySelectorAll('a[href^="/politiques/"]')];
    expect(fiches.map((a) => a.getAttribute("href"))).toEqual(["/politiques/claire-martin"]);
  });

  it("porte la phrase fixe une seule fois et ne parle ni de soutien ni d'absence ailleurs", () => {
    const lignes = [ligne(), ligne({ id: "p-2", lastName: "MARTIN" })];
    const { container } = render(<ParrainagesCommune blocs={[{ electionSlug: SLUG, lignes }]} />);
    const content = text(container);
    expect(content.match(/Une présentation n'est pas un soutien politique\./g)).toHaveLength(1);
    expect(content.replace("Une présentation n'est pas un soutien politique.", "")).not.toMatch(
      /sout|parrain[ée]|n'a pas présenté|aucun/i
    );
  });
});

describe("ParrainagesDepartement", () => {
  it("ne rend rien sans présentation dans le département", () => {
    const { container } = render(<ParrainagesDepartement resumes={[]} departmentSlug="nord" />);
    expect(container.innerHTML).toBe("");
  });

  it("donne les comptes et mène à la page des élus du département", () => {
    const { container } = render(
      <ParrainagesDepartement
        resumes={[{ electionSlug: SLUG, total: 259, candidats: 19 }]}
        departmentSlug="nord"
      />
    );
    expect(text(container).replace(/ /g, " ")).toContain(
      "259 présentations publiées par des élus de ce département, pour 19 candidats."
    );
    expect(
      container.querySelector(
        'a[href="/elections/presidentielle-2022/parrainages/departements/nord"]'
      )?.textContent
    ).toBe("Élus et candidats présentés en 2022");
  });
});
