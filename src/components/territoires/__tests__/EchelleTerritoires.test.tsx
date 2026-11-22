import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EchelleTerritoires } from "@/components/territoires/EchelleTerritoires";
import type { Barreau } from "@/lib/territoires/echelle";

const barreau = (over: Partial<Barreau>): Barreau => ({
  niveau: "region",
  titre: "Région",
  nom: "Bretagne",
  href: "/territoires/regions/bretagne",
  competences: null,
  ici: false,
  ...over,
});

describe("EchelleTerritoires : comptes", () => {
  it("lie les comptes d'un niveau publié, avec un nom qui dit de qui", () => {
    const html = renderToStaticMarkup(
      <EchelleTerritoires
        barreaux={[barreau({ comptesHref: "/territoires/regions/bretagne/budget" })]}
      />
    );
    expect(html).toContain('href="/territoires/regions/bretagne/budget"');
    expect(html).toContain('aria-label="Ses comptes, Bretagne"');
    expect(html).toContain(">Ses comptes</a>");
  });

  it("ne lie rien quand les comptes ne sont pas publiés", () => {
    const html = renderToStaticMarkup(<EchelleTerritoires barreaux={[barreau({})]} />);
    expect(html).not.toContain("Ses comptes");
  });
});
