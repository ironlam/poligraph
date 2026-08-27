import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommuneLookup } from "../CommuneLookup";

/**
 * The lookup carries three promises the obvious implementation breaks.
 *
 * A postal code is not a commune, so an ambiguous one must offer a choice instead of
 * quietly keeping the largest match. A code resolves to a commune and never to an
 * arrondissement. And a department outside this renewal still gets a real answer,
 * because half the visitors are in that case.
 */

const BAZAS = {
  id: "33036",
  name: "Bazas",
  departmentCode: "33",
  departmentName: "Gironde",
};
const BERNOS = {
  id: "33046",
  name: "Bernos-Beaulac",
  departmentCode: "33",
  departmentName: "Gironde",
};
const PARIS = { id: "75056", name: "Paris", departmentCode: "75", departmentName: "Paris" };
const MAMOUDZOU = {
  id: "97611",
  name: "Mamoudzou",
  departmentCode: "976",
  departmentName: "Mayotte",
};

const BAZAS_ANSWER = {
  commune: BAZAS,
  college: {
    councilSeats: 27,
    population: 4854,
    regime: "scale",
    scaleDelegates: 15,
    delegatesByRight: null,
    supplementaryDelegates: 0,
    supplementaryBrackets: 0,
    total: 15,
  },
  inhabitantsPerDelegate: 323.6,
  renewal: "renewed",
  seatsAtStake: 6,
  senators: [
    {
      slug: "florence-lassarade",
      fullName: "Florence Lassarade",
      civility: "Mme",
      photoUrl: null,
      constituency: "Gironde",
      series: 2,
      groupName: "Les Républicains",
      groupShortName: "LR",
      groupColor: null,
      declarationYear: 2026,
      hasOngoingProceedings: false,
    },
    {
      slug: "temoin-procedure",
      fullName: "Sénateur Témoin",
      civility: "M.",
      photoUrl: null,
      constituency: "Gironde",
      series: 2,
      groupName: "Groupe Témoin",
      groupShortName: null,
      groupColor: null,
      declarationYear: null,
      hasOngoingProceedings: true,
    },
  ],
};

const PARIS_ANSWER = {
  commune: PARIS,
  college: {
    councilSeats: 163,
    population: 2103778,
    regime: "by-right",
    scaleDelegates: null,
    delegatesByRight: 163,
    supplementaryDelegates: 2592,
    supplementaryBrackets: 2592,
    total: 2755,
  },
  inhabitantsPerDelegate: 763.6,
  renewal: "not-renewed",
  seatsAtStake: null,
  senators: [],
};

const MAMOUDZOU_ANSWER = {
  commune: MAMOUDZOU,
  college: null,
  inhabitantsPerDelegate: null,
  renewal: "not-renewed",
  seatsAtStake: null,
  senators: [],
};

function mockFetch(routes: Record<string, unknown>) {
  return vi.fn((url: string) => {
    for (const [fragment, payload] of Object.entries(routes)) {
      if (url.includes(fragment)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) } as Response);
      }
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as Response);
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch({}));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function search(code: string) {
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText("Code postal"));
  await user.type(screen.getByLabelText("Code postal"), code);
  await user.click(screen.getByRole("button", { name: "Voir" }));
  return user;
}

describe("CommuneLookup : désambiguïsation", () => {
  it("propose un choix quand le code postal couvre plusieurs communes", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "cp=33430": { postalCode: "33430", communes: [BAZAS, BERNOS] },
        "insee=33036": BAZAS_ANSWER,
      })
    );
    render(<CommuneLookup phase="before" />);
    const user = await search("33430");

    await screen.findByText(/couvre 2 communes/);
    expect(screen.getByRole("button", { name: "Bazas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bernos-Beaulac" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Bazas" }));
    await screen.findByText("Bazas");
    expect(screen.getByText("15")).toBeInTheDocument();
  });

  it("résout directement quand le code ne désigne qu'une commune", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "cp=33430": { postalCode: "33430", communes: [BAZAS] },
        "insee=33036": BAZAS_ANSWER,
      })
    );
    render(<CommuneLookup phase="before" />);
    await search("33430");

    await screen.findByText("Bazas");
    expect(screen.queryByText(/couvre/)).toBeNull();
  });

  it("dit qu'aucune commune ne correspond plutôt que de rester muet", async () => {
    vi.stubGlobal("fetch", mockFetch({ "cp=99999": { postalCode: "99999", communes: [] } }));
    render(<CommuneLookup phase="before" />);
    await search("99999");

    await screen.findByText(/Aucune commune trouvée/);
  });
});

describe("CommuneLookup : département renouvelable", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "cp=33430": { postalCode: "33430", communes: [BAZAS] },
        "insee=33036": BAZAS_ANSWER,
      })
    );
  });

  it("accorde la préposition du département au lieu d'un « en » figé", async () => {
    render(<CommuneLookup phase="before" />);
    await search("33430");
    await screen.findByText(/6 sièges à pourvoir en Gironde le 27 septembre/);
    expect(screen.getByRole("heading", { name: "Vos sénateurs en Gironde" })).toBeInTheDocument();
  });

  it("montre le barème et le poids par habitant", async () => {
    render(<CommuneLookup phase="before" />);
    await search("33430");
    await screen.findByText("27");
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText(/1 grand électeur pour 324 habitants/)).toBeInTheDocument();
  });

  it("marque chaque siège remis en jeu", async () => {
    render(<CommuneLookup phase="before" />);
    await search("33430");
    await waitFor(() => expect(screen.getAllByText("Siège en jeu")).toHaveLength(2));
  });

  it("nomme l'autorité quand aucune déclaration n'est publiée", async () => {
    render(<CommuneLookup phase="before" />);
    await search("33430");
    await screen.findByText(/Aucune déclaration publiée par la HATVP à ce jour/);
    expect(screen.getByText(/Déclaration de patrimoine 2026/)).toBeInTheDocument();
  });

  /**
   * Signal discret, jamais un filtre, jamais un tri, jamais un agrégat, **jamais un
   * compteur**. Le rendu affichait « 2 procédures en cours » : un nombre invite à classer les
   * personnes alors qu'il ne dit rien de la gravité ni de l'issue. La couche données expose
   * désormais un booléen, donc aucune cardinalité n'atteint le composant.
   */
  it("signale une procédure sans la compter, avec la présomption d'innocence", async () => {
    render(<CommuneLookup phase="before" />);
    await search("33430");
    const signal = await screen.findByText(/Procédure judiciaire en cours/);
    expect(signal.textContent).toMatch(/présomption d'innocence/);
  });

  it("ne rend aucun nombre de procédures", async () => {
    const { container } = render(<CommuneLookup phase="before" />);
    await search("33430");
    await screen.findByText(/Procédure judiciaire en cours/);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\d+\s*procédures?/i);
    expect(text).not.toMatch(/procédures? en cours\s*:\s*\d/i);
  });

  it("n'affiche ni ancienneté ni participation, faute de provenance fiable", async () => {
    render(<CommuneLookup phase="before" />);
    await search("33430");
    await screen.findByText("Bazas");
    expect(screen.queryByText(/sénatrice depuis|sénateur depuis/i)).toBeNull();
    expect(screen.queryByText(/Participation\s*\d/)).toBeNull();
    expect(
      screen.getByText(/La participation aux scrutins publics n'est pas affichée/)
    ).toBeInTheDocument();
  });
});

describe("CommuneLookup : département non renouvelable", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "cp=75011": { postalCode: "75011", communes: [PARIS] },
        "insee=75056": PARIS_ANSWER,
      })
    );
  });

  // La moitié des visiteurs est dans ce cas : le bloc doit répondre, pas se fermer.
  it("montre quand même les grands électeurs et dit quand ils voteront", async () => {
    render(<CommuneLookup phase="before" />);
    await search("75011");

    await screen.findByText(/Aucun siège à pourvoir à Paris cette année/);
    expect(screen.getByText("2 755")).toBeInTheDocument();
    expect(screen.getByText(/série renouvelée en 2029/)).toBeInTheDocument();
  });

  /**
   * Régression : le décret du 21 avril 2026 ne convoque le 5 juin que les conseils
   * municipaux des départements renouvelés, plus la Guyane et la Polynésie française.
   * Une commune de série 1 n'a désigné personne ce jour-là, et le chiffre affiché est
   * ce que donne le barème aujourd'hui, pas un décompte de délégués déjà nommés.
   */
  it("n'attribue aucune désignation du 5 juin à un département non renouvelé", async () => {
    render(<CommuneLookup phase="before" />);
    await search("75011");

    await screen.findByText(/Aucun siège à pourvoir à Paris cette année/);
    expect(screen.queryByText(/5 juin/)).toBeNull();
    expect(screen.queryByText(/ont bien été désignés/)).toBeNull();
    expect(screen.getByText(/le barème donne 2 755 grands électeurs/)).toBeInTheDocument();
    expect(screen.getByText(/sera constitué pour ce renouvellement/)).toBeInTheDocument();
  });

  it("emploie « à Paris », jamais « en Paris »", async () => {
    render(<CommuneLookup phase="before" />);
    await search("75011");
    await screen.findByText(/à Paris cette année/);
    expect(screen.queryByText(/en Paris/)).toBeNull();
  });

  it("applique l'effectif réel du Conseil de Paris, pas le barème générique", async () => {
    render(<CommuneLookup phase="before" />);
    await search("75011");
    await screen.findByText("163");
    expect(screen.queryByText("69")).toBeNull();
  });
});

/**
 * La formulation suit la phase résolue, jamais une date comparée dans le composant.
 * Après le scrutin, une page qui lit encore « à pourvoir le 27 septembre » n'est pas
 * seulement périmée : elle affirme quelque chose de faux.
 */
describe("CommuneLookup : formulation selon la phase du scrutin", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "cp=33430": { postalCode: "33430", communes: [BAZAS] },
        "insee=33036": BAZAS_ANSWER,
      })
    );
  });

  it("avant le scrutin : au futur, avec la date", async () => {
    render(<CommuneLookup phase="before" />);
    await search("33430");
    await screen.findByText(/6 sièges à pourvoir en Gironde le 27 septembre/);
    expect(screen.getByText(/voteront ce jour-là/)).toBeInTheDocument();
  });

  /**
   * Au présent, mais sans terme relatif au lecteur : la phase `polling-day` vient de
   * `resolveElectionStatus`, qui couvre 2 h à 2 h heure de Paris, et le 27 à Paris n'est pas
   * le 27 partout. « ce 27 septembre » est présent sans rien affirmer sur le jour local.
   */
  it("le jour du scrutin : au présent, sans terme relatif au lecteur", async () => {
    render(<CommuneLookup phase="polling-day" />);
    await search("33430");
    await screen.findByText(/6 sièges sont à pourvoir en Gironde ce 27 septembre/);
    expect(screen.getByText(/votent ce 27 septembre/)).toBeInTheDocument();
    expect(screen.queryByText(/aujourd'hui/)).toBeNull();
  });

  it("après le scrutin : au passé, et aucun résultat annoncé", async () => {
    render(<CommuneLookup phase="after" />);
    await search("33430");
    await screen.findByText(/faisait partie du renouvellement du 27 septembre/);
    expect(screen.getByText(/y ont pris part/)).toBeInTheDocument();
    expect(screen.queryByText(/à pourvoir/)).toBeNull();
    expect(screen.queryByText(/voteront|votent ce 27 septembre/)).toBeNull();
    // Rien ne doit ressembler à une proclamation tant que l'état 4 n'existe pas.
    expect(screen.queryByText(/élu|réélu|résultat/i)).toBeNull();
  });
});

describe("CommuneLookup : absences", () => {
  it("dit que le nombre de délégués est inconnu au lieu d'afficher un zéro", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "cp=33430": { postalCode: "33430", communes: [BAZAS] },
        "insee=33036": {
          ...BAZAS_ANSWER,
          college: null,
          inhabitantsPerDelegate: null,
        },
      })
    );
    render(<CommuneLookup phase="before" />);
    await search("33430");

    await screen.findByText(/Nombre de délégués inconnu/);
    expect(screen.queryByText(/^0$/)).toBeNull();
  });

  it("dit qu'elle ne connaît pas la série plutôt que de choisir un camp", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "cp=33430": { postalCode: "33430", communes: [BAZAS] },
        "insee=33036": { ...BAZAS_ANSWER, renewal: "unknown", seatsAtStake: null },
      })
    );
    render(<CommuneLookup phase="before" />);
    await search("33430");

    await screen.findByText(/Série de renouvellement inconnue/);
    expect(screen.queryByText(/à pourvoir/)).toBeNull();
    expect(screen.queryByText(/Aucun siège/)).toBeNull();
  });

  it("signale une panne réseau au lieu de rester sur un état vide", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline")))
    );
    render(<CommuneLookup phase="before" />);
    await search("33430");

    await screen.findByText(/La recherche a échoué/);
  });
});

describe("CommuneLookup : provenance statutaire", () => {
  it("source précisément les deux sièges et la série de Mayotte", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "cp=97600": { postalCode: "97600", communes: [MAMOUDZOU] },
        "insee=97611": MAMOUDZOU_ANSWER,
      })
    );
    render(<CommuneLookup phase="before" />);
    await search("97600");

    expect(await screen.findByText(/Mayotte : 2 sièges selon LO473/)).toBeVisible();
    expect(screen.getByRole("link", { name: /LO473 et L474/ })).toHaveAttribute(
      "href",
      expect.stringContaining("LEGISCTA000006148536")
    );
    expect(screen.queryByRole("link", { name: /tableau n° 6/ })).toBeNull();
  });
});
