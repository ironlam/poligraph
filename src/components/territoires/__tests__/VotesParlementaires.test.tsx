import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import type { VotesDeputes } from "@/lib/data/territoire-votes";
import { VotesParlementaires } from "../VotesParlementaires";

const votes = (
  slug: string,
  positions: VotesDeputes["scrutins"][number]["positions"]
): VotesDeputes => ({
  deputeSlugs: ["a", "b"],
  scrutins: [
    {
      slug,
      titre: "l'ensemble du projet de loi",
      nature: "Texte final",
      resultat: "Adopté",
      date: "2026-11-12",
      positions,
      sansVote: [],
    },
  ],
});

describe("VotesParlementaires", () => {
  it("ne rend rien sans scrutin", () => {
    const vide = { scrutins: [], deputeSlugs: ["a"] };
    expect(
      render(<VotesParlementaires votes={vide} mode={{ kind: "renvoi" }} />).container.innerHTML
    ).toBe("");
  });

  it("commune : nomme le député et dit sa position en mots", () => {
    const { container } = render(
      <VotesParlementaires
        votes={votes("s-an", { a: "CONTRE" })}
        mode={{ kind: "depute", depute: { slug: "a", fullName: "Claire Martin" } }}
      />
    );
    expect(container.textContent).toContain("Claire Martin : contre");
    expect(container.textContent).toContain("Texte final · Adopté");
    expect(container.querySelector('a[href="/parlement/votes/s-an"]')).not.toBeNull();
    expect(container.querySelector("h3")).toBeNull();
  });

  it("sans député établi : aucun nom, renvoi vers Mon député", () => {
    const { container } = render(
      <VotesParlementaires votes={votes("s-an", { a: "POUR" })} mode={{ kind: "renvoi" }} />
    );
    expect(container.querySelector('a[href^="/politiques/"]')).toBeNull();
    expect(container.querySelector('a[href="/mon-depute"]')).not.toBeNull();
  });

  it("département : décompte sans nom, députés puis sénateurs", () => {
    const { container } = render(
      <VotesParlementaires
        votes={votes("s-an", { a: "POUR", b: "CONTRE" })}
        mode={{ kind: "decompte" }}
        senat={votes("s-senat", { a: "POUR", b: "POUR" })}
      />
    );
    expect([...container.querySelectorAll("h3")].map((h) => h.textContent)).toEqual([
      "À l'Assemblée nationale",
      "Au Sénat",
    ]);
    expect(container.textContent).toContain("Députés du département : 1 pour, 1 contre");
    expect(container.textContent).toContain("Sénateurs du département : 2 pour");
    expect(container.querySelector('a[href^="/politiques/"]')).toBeNull();
  });

  it("département sans sénateur ni scrutin du Sénat : pas de seconde liste", () => {
    const { container } = render(
      <VotesParlementaires
        votes={votes("s-an", {})}
        mode={{ kind: "decompte" }}
        senat={{ scrutins: [], deputeSlugs: [] }}
      />
    );
    expect(container.querySelector("h3")).toBeNull();
  });
});
