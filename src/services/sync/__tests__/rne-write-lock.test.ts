import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncHandler } from "@/lib/sync";

const h = vi.hoisted(() => ({
  findMandates: vi.fn(),
  findMandateLocals: vi.fn(),
  findPoliticians: vi.fn(),
  findDecisions: vi.fn(),
  queryRaw: vi.fn(),
  findCommunes: vi.fn(),
  countMandates: vi.fn(),
  unexpectedDBAccess: vi.fn(),
  resolveUrl: vi.fn(),
  getText: vi.fn(),
  resolveBatch: vi.fn(),
  createCLI: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  // Permit only the reads used by dry-run and stats. Any other DB access fails,
  // including a new writer not anticipated by this test.
  db: new Proxy(
    {},
    {
      get: (_target, model: string) => {
        // `NameFrequencyCache.loadFromDb` reads through `db.$queryRaw`, which is a method on
        // the client itself and not a model.
        if (model === "$queryRaw") return h.queryRaw;
        return new Proxy(
          {},
          {
            get: (_model, operation: string) => {
              const reads: Record<string, unknown> = {
                "mandate.findMany": h.findMandates,
                // Phase 1 now judges each row before deciding what to do with it, so a dry
                // run reads the mandates we hold and the mayors already in place.
                "mandateLocal.findMany": h.findMandateLocals,
                "commune.findMany": h.findCommunes,
                // La simulation de la Phase 2 rejoue les phases A et B du résolveur. Ce sont
                // des lectures : si l'une d'elles devenait une écriture, ce proxy le dirait.
                "politician.findMany": h.findPoliticians,
                "identityDecision.findMany": h.findDecisions,
                "mandate.count": h.countMandates,
              };
              const key = `${model}.${operation}`;
              if (key in reads) return reads[key];
              h.unexpectedDBAccess(key);
              throw new Error(`Unexpected DB access: ${key}`);
            },
          }
        );
      },
    }
  ),
}));
vi.mock("@/lib/api/http-client", () => ({
  HTTPClient: class {
    getText = h.getText;
  },
}));
vi.mock("../rne-resource", () => ({
  resolveRneResourceUrl: h.resolveUrl,
  RNE_MAIRES_FRAGMENTS: ["maires"],
}));
// Only the batch resolver is stubbed: Phase 1 judges each row with the real scorer, and a
// fake one would let this test pass while the decision logic was wrong.
vi.mock("@/lib/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/identity")>()),
  resolveBatch: h.resolveBatch,
}));
vi.mock("@/lib/sync", () => ({ createCLI: h.createCLI }));

import { getRNEStats, resolveParties, syncRNEMaires } from "../rne";

const CSV = [
  "Code du département;Code de la commune;Libellé de la commune;Nom de l'élu;Prénom de l'élu;Code sexe;Date de naissance;Date de début du mandat;Date de début de la fonction",
  "01;01001;Commune test;MARTIN;Alice;F;1970-04-02;2026-03-22;2026-04-05",
].join("\n");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  h.findMandates.mockResolvedValue([
    {
      id: "old-mandate",
      politicianId: "predecessor",
      localData: { communeId: "01001", rneExternalId: "01001" },
    },
  ]);
  h.findMandateLocals.mockResolvedValue([]);
  h.findPoliticians.mockResolvedValue([]);
  h.findDecisions.mockResolvedValue([]);
  h.queryRaw.mockResolvedValue([]);
  h.findCommunes.mockResolvedValue([{ id: "01001" }]);
  h.countMandates.mockResolvedValue(1);
  h.resolveUrl.mockResolvedValue("https://example.test/maires.csv");
  h.getText.mockResolvedValue({ data: CSV });
});

afterEach(() => {
  expect(h.unexpectedDBAccess).not.toHaveBeenCalled();
  expect(h.resolveBatch).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

function expectNoIO() {
  expect(h.findMandates).not.toHaveBeenCalled();
  expect(h.findMandateLocals).not.toHaveBeenCalled();
  expect(h.findPoliticians).not.toHaveBeenCalled();
  expect(h.findCommunes).not.toHaveBeenCalled();
  expect(h.countMandates).not.toHaveBeenCalled();
  expect(h.resolveUrl).not.toHaveBeenCalled();
  expect(h.getText).not.toHaveBeenCalled();
}

describe("RNE : le dry-run ne doit jamais écrire", () => {
  it.each([{}, { limit: 1, verbose: true }])("keeps dry-run read-only with %j", async (options) => {
    const result = await syncRNEMaires({ ...options, dryRun: true });
    expect(result.success).toBe(true);
    expect(result.officialsCreated).toBe(1);
    expect(result.errors).toEqual([]);
    expect(h.findMandates).toHaveBeenCalledOnce();
    expect(h.findCommunes).toHaveBeenCalledOnce();
    expect(h.getText).toHaveBeenCalledOnce();
  });

  it("juge une succession sans rien écrire", async () => {
    // Le registre donne MARTIN Alice, nous détenons DURAND Bob sur la même commune. Avant le
    // correctif, cette ligne réécrivait l'état civil de DURAND avec celui de MARTIN.
    h.findMandateLocals.mockResolvedValue([
      {
        id: "local-1",
        rneExternalId: "01001",
        communeId: "01001",
        mandate: {
          id: "old-mandate",
          politicianId: "predecessor",
          startDate: new Date("2020-05-24"),
          politician: {
            firstName: "Bob",
            lastName: "DURAND",
            birthDate: new Date("1955-01-01"),
          },
        },
      },
    ]);

    const result = await syncRNEMaires({ dryRun: true });

    expect(result.errors).toEqual([]);
    expect(result.officialsUpdated).toBe(0);
    expect(result.officialsCreated).toBe(1);
    expect(result.mandatesClosed).toBe(1);
  });

  it("confirme le même titulaire sans rien écrire", async () => {
    h.findMandateLocals.mockResolvedValue([
      {
        id: "local-1",
        rneExternalId: "01001",
        communeId: "01001",
        mandate: {
          id: "old-mandate",
          politicianId: "same-person",
          startDate: new Date("2020-05-24"),
          politician: {
            firstName: "Alice",
            lastName: "MARTIN",
            birthDate: new Date("1970-04-02"),
          },
        },
      },
    ]);

    const result = await syncRNEMaires({ dryRun: true });

    expect(result.errors).toEqual([]);
    expect(result.officialsUpdated).toBe(1);
    expect(result.officialsCreated).toBe(0);
    expect(result.mandatesClosed).toBe(0);
  });

  it("ouvre un nouveau mandat sur une fiche connue au lieu de la republier", async () => {
    // Nous détenons un mandat de MARTIN Alice sur 01001, clos. Le registre la nomme à nouveau :
    // c'est une réélection. Créer une fiche produirait un doublon publié ; rouvrir l'ancien
    // mandat écraserait sa date de début et effacerait le mandat précédent. Il faut un second
    // mandat sur la fiche existante.
    h.findMandateLocals.mockImplementation(
      async (args: { where: { mandate: { isCurrent: boolean } } }) =>
        args.where.mandate.isCurrent
          ? []
          : [
              {
                id: "local-1",
                rneExternalId: "01001",
                communeId: "01001",
                mandate: {
                  id: "closed-mandate",
                  politicianId: "same-person",
                  startDate: new Date("2020-05-24"),
                  politician: {
                    firstName: "Alice",
                    lastName: "MARTIN",
                    birthDate: new Date("1970-04-02"),
                  },
                },
              },
            ]
    );

    const result = await syncRNEMaires({ dryRun: true });

    expect(result.errors).toEqual([]);
    // Aucune fiche créée, aucune fiche mise à jour : un mandat de plus, c'est tout.
    expect(result.officialsCreated).toBe(0);
    expect(result.officialsUpdated).toBe(0);
    expect(result.mandatesCreated).toBe(1);
    expect(result.mandatesClosed).toBe(0);
  });

  it("ne ressuscite pas un ancien maire à côté de celui en place", async () => {
    // Le registre est en retard et nomme encore MARTIN Alice, dont nous détenons le mandat
    // clos. Mais la commune a un maire en exercice, issu des municipales. Traiter le mandat
    // clos en premier mettrait deux maires courants sur une commune.
    h.findMandateLocals.mockImplementation(
      async (args: { where: { mandate: { isCurrent: boolean } } }) =>
        args.where.mandate.isCurrent
          ? [
              {
                id: "local-incumbent",
                rneExternalId: null,
                communeId: "01001",
                mandate: {
                  id: "incumbent-mandate",
                  politicianId: "elected-in-march",
                  startDate: new Date("2026-03-26"),
                  politician: {
                    firstName: "Bob",
                    lastName: "DURAND",
                    birthDate: new Date("1955-01-01"),
                  },
                },
              },
            ]
          : [
              {
                id: "local-closed",
                rneExternalId: "01001",
                communeId: "01001",
                mandate: {
                  id: "closed-mandate",
                  politicianId: "former-mayor",
                  startDate: new Date("2020-05-24"),
                  politician: {
                    firstName: "Alice",
                    lastName: "MARTIN",
                    birthDate: new Date("1970-04-02"),
                  },
                },
              },
            ]
    );

    const result = await syncRNEMaires({ dryRun: true });

    expect(result.errors).toEqual([]);
    // Le maire en place est jugé, pas contourné : une fermeture, et un mandat pour la personne
    // que nous connaissons déjà.
    expect(result.mandatesClosed).toBe(1);
    expect(result.officialsCreated).toBe(0);
    expect(result.mandatesCreated).toBe(1);
  });

  it("ne ressuscite pas un ancien maire quand le registre est en retard", async () => {
    // Commune de moins de 1 000 habitants : `reconcile-municipales` a fermé l'ancien maire en
    // mars 2026 sans créer de successeur, donc personne n'est en place. Le registre d'août
    // nomme encore cet ancien maire, avec sa prise de fonction de 2020. Lui ouvrir un mandat
    // courant qui démarre en 2020 chevaucherait celui qu'on vient de fermer.
    h.getText.mockResolvedValue({
      data: [
        "Code du département;Code de la commune;Libellé de la commune;Nom de l'élu;Prénom de l'élu;Code sexe;Date de naissance;Date de début du mandat;Date de début de la fonction",
        "01;01001;Commune test;MARTIN;Alice;F;1970-04-02;2020-05-24;2020-05-24",
      ].join("\n"),
    });
    h.findMandateLocals.mockImplementation(
      async (args: { where: { mandate: { isCurrent: boolean } } }) =>
        args.where.mandate.isCurrent
          ? []
          : [
              {
                id: "local-closed",
                rneExternalId: "01001",
                communeId: "01001",
                mandate: {
                  id: "closed-mandate",
                  politicianId: "former-mayor",
                  startDate: new Date("2020-05-24"),
                  politician: {
                    firstName: "Alice",
                    lastName: "MARTIN",
                    birthDate: new Date("1970-04-02"),
                  },
                },
              },
            ]
    );

    const result = await syncRNEMaires({ dryRun: true });

    expect(result.errors).toEqual([]);
    expect(result.officialsCreated).toBe(0);
    expect(result.mandatesCreated).toBe(0);
    expect(result.mandatesClosed).toBe(0);
  });

  it("ne rouvre pas le mandat fermé de quelqu'un d'autre", async () => {
    h.findMandateLocals.mockImplementation(
      async (args: { where: { mandate: { isCurrent: boolean } } }) =>
        args.where.mandate.isCurrent
          ? []
          : [
              {
                id: "local-1",
                rneExternalId: "01001",
                communeId: "01001",
                mandate: {
                  id: "closed-mandate",
                  politicianId: "predecessor",
                  startDate: new Date("2020-05-24"),
                  politician: {
                    firstName: "Bob",
                    lastName: "DURAND",
                    birthDate: new Date("1955-01-01"),
                  },
                },
              },
            ]
    );

    const result = await syncRNEMaires({ dryRun: true });

    expect(result.errors).toEqual([]);
    expect(result.officialsCreated).toBe(1);
    expect(result.officialsUpdated).toBe(0);
    expect(result.mandatesClosed).toBe(0);
  });

  it("chiffre la Phase 2 sans écrire une seule décision", async () => {
    // La vraie Phase 2 fusionne puis SUPPRIME la fiche créée par l'import. Le dry-run doit
    // rendre ce nombre avant qu'on déverrouille les écritures, et `resolveBatch` ne peut pas
    // servir : sa phase C persiste une IdentityDecision par entrée.
    h.findPoliticians.mockResolvedValue([
      {
        id: "national-alice",
        firstName: "Alice",
        lastName: "MARTIN",
        birthDate: new Date("1970-04-02"),
        civility: "Mme",
        prominenceScore: 0,
        mandates: [],
      },
    ]);

    const result = await syncRNEMaires({ dryRun: true });

    expect(result.errors).toEqual([]);
    // La ligne aurait créé une fiche, que la Phase 2 aurait aussitôt fusionnée et supprimée.
    expect(result.officialsCreated).toBe(1);
    expect(result.phase2Simulation).toEqual({ matched: 1, review: 0, notFound: 0, blocked: 0 });
  });

  it("ne compte aucune fusion quand personne ne correspond", async () => {
    h.findPoliticians.mockResolvedValue([
      {
        id: "national-bob",
        firstName: "Bob",
        lastName: "DURAND",
        birthDate: new Date("1955-01-01"),
        civility: "M.",
        prominenceScore: 0,
        mandates: [],
      },
    ]);

    const result = await syncRNEMaires({ dryRun: true });

    expect(result.phase2Simulation).toEqual({ matched: 0, review: 0, notFound: 1, blocked: 0 });
  });

  it("keeps statistics available without external requests", async () => {
    expect(await getRNEStats()).toEqual({
      totalMaires: 1,
      totalCurrent: 1,
      totalWithNationalPresence: 1,
    });
    expect(h.countMandates).toHaveBeenCalledTimes(3);
    expect(h.getText).not.toHaveBeenCalled();
  });

  it("laisse la résolution des partis verrouillée", async () => {
    // Ce writer rattache un parti à une personne par le seul code commune, sans contrôle
    // d'identité : c'est la forme exacte du bug dont le sync des maires a été guéri, et lui
    // ne l'a pas été.
    await expect(resolveParties()).rejects.toThrow("RNE_PARTY_WRITES_SUSPENDED");
    expectNoIO();
  });

  it("propage le verrou des partis à travers le CLI", async () => {
    await import("../../../../scripts/sync-rne");
    const handler = h.createCLI.mock.calls[0]![0] as SyncHandler;
    for (const options of [{ resolveParties: true }, { resolveParties: true, dryRun: true }]) {
      await expect(handler.sync(options)).rejects.toThrow("RNE_PARTY_WRITES_SUSPENDED");
    }
    expectNoIO();
  });
});
