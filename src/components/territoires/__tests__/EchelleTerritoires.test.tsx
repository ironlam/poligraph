import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EchelleTerritoires, echelleResume } from "@/components/territoires/EchelleTerritoires";
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

describe("EchelleTerritoires : repli", () => {
  const barreaux = [
    barreau({ niveau: "commune", titre: "Commune", nom: "Brest", href: undefined, ici: true }),
    barreau({ niveau: "intercommunalite", titre: "Intercommunalité", nom: "Brest Métropole" }),
    barreau({ niveau: "departement", titre: "Département", nom: "Finistère (29)" }),
    barreau({}),
  ];

  it("résume les échelons dans l'ordre, du plus proche au plus lointain", () => {
    expect(echelleResume(barreaux)).toBe("Commune, intercommunalité, département et région");
    expect(echelleResume([barreau({})])).toBe("Région");
  });

  it("replie la liste et ses liens dans le HTML servi, garde le titre et la source visibles", () => {
    const html = renderToStaticMarkup(<EchelleTerritoires barreaux={barreaux} />);
    const repli = html.slice(html.indexOf("<details"), html.indexOf("</details>"));
    expect(html).not.toContain("<details open");
    expect(repli).toContain('href="/territoires/regions/bretagne"');
    expect(repli).toContain("<ol");
    expect(html.indexOf("Qui s&#x27;occupe de quoi")).toBeLessThan(html.indexOf("<details"));
    expect(html.indexOf("Vérifié le")).toBeGreaterThan(html.indexOf("</details>"));
  });
});
