import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));

import { buildMotionsDeCensure } from "../motions-de-censure";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const motion = (over: Record<string, unknown>) => ({
  slug: "m",
  title:
    "la motion de censure déposée en application de l'article 49, alinéa 3, de la Constitution",
  votingDate: d("2026-01-14"),
  legislature: 17,
  votesFor: 100,
  result: "REJECTED",
  sourceUrl: "https://www.assemblee-nationale.fr/dyn/17/scrutins/1",
  seats: [575],
  ...over,
});

const governments = [
  { slug: "borne", name: "Gouvernement Élisabeth Borne", appointedAt: d("2022-05-16") },
  { slug: "barnier", name: "Gouvernement Michel Barnier", appointedAt: d("2024-09-05") },
  { slug: "lecornu-2", name: "Gouvernement Sébastien Lecornu II", appointedAt: d("2025-10-10") },
];

describe("buildMotionsDeCensure", () => {
  const data = buildMotionsDeCensure(
    [
      motion({ slug: "recente" }),
      motion({
        slug: "barnier",
        votingDate: d("2024-12-04"),
        votesFor: 331,
        result: "ADOPTED",
        seats: [574],
        title: "la motion de censure déposée en application de l'article 49, alinéa 3",
      }),
      motion({ slug: "xvie", legislature: 16, votingDate: d("2023-03-20"), seats: [577] }),
    ],
    governments,
    [
      {
        legislature: 17,
        organeRef: "PO2",
        label: "Socialistes et apparentés",
        abbreviation: "SOC",
        motionsDuringGroup: 2,
        motionsWithVotes: 2,
        votesFor: 120,
      },
      {
        legislature: 17,
        organeRef: "PO1",
        label: "Droite Républicaine",
        abbreviation: "DR",
        motionsDuringGroup: 2,
        motionsWithVotes: 0,
        votesFor: 0,
      },
    ],
    [
      { legislature: 17, slug: "a", fullName: "A", count: 2 },
      { legislature: 16, slug: "b", fullName: "B", count: 1 },
    ]
  );

  it("compte les motions et les adoptions", () => {
    expect(data.total).toBe(3);
    expect(data.adopted).toBe(1);
  });

  it("range les législatures de la plus récente à la plus ancienne", () => {
    expect(data.legislatures.map((l) => l.legislature)).toEqual([17, 16]);
  });

  it("calcule la majorité, l'article et le gouvernement de chaque motion", () => {
    const [recente, barnier] = data.legislatures[0]!.motions;
    expect(recente).toMatchObject({
      requiredMajority: 288,
      article: "49-3",
      adopted: false,
      government: { slug: "lecornu-2" },
    });
    expect(barnier).toMatchObject({
      requiredMajority: 288,
      adopted: true,
      government: { slug: "barnier", name: "Gouvernement Michel Barnier" },
    });
    expect(data.legislatures[1]!.motions[0]).toMatchObject({
      requiredMajority: 289,
      government: { slug: "borne" },
    });
  });

  it("présente les groupes dans l'ordre alphabétique, quel que soit leur nombre de voix", () => {
    expect(data.legislatures[0]!.groups.map((g) => g.abbreviation)).toEqual(["DR", "SOC"]);
  });

  it("répartit les députés par législature", () => {
    expect(data.legislatures[0]!.deputies.map((x) => x.slug)).toEqual(["a"]);
    expect(data.legislatures[1]!.deputies.map((x) => x.slug)).toEqual(["b"]);
  });
});
