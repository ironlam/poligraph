import { describe, expect, it } from "vitest";
import {
  PRISMA_TRANSACTION_OPTIONS,
  resolvePoolMax,
  DEFAULT_POOL_MAX,
  MAX_POOL_MAX,
} from "../database";

describe("configuration des transactions Prisma", () => {
  it("laisse passer une transition dépassant le défaut Prisma de cinq secondes", () => {
    expect(PRISMA_TRANSACTION_OPTIONS.maxWait).toBe(5_000);
    expect(PRISMA_TRANSACTION_OPTIONS.timeout).toBe(15_000);
    expect(PRISMA_TRANSACTION_OPTIONS.timeout).toBeGreaterThan(6_000);
    expect(PRISMA_TRANSACTION_OPTIONS.timeout).toBeLessThan(30_000);
  });
});

describe("resolvePoolMax", () => {
  it("dimensionne le pool pour absorber des rendus à froid concurrents", () => {
    // Mesuré sur staging le 2026-09-22 : avec un rendu de 3 s immobilisant une connexion, un pool
    // de 2 commence à refuser à partir du 11e rendu concurrent, ce qui est la forme de POLIGRAPH-V.
    // Un pool de 8 a servi 16 rendus concurrents sans un seul refus.
    expect(resolvePoolMax({})).toBe(DEFAULT_POOL_MAX);
    expect(DEFAULT_POOL_MAX).toBeGreaterThan(2);
  });

  it("se laisse surcharger sans redéploiement", () => {
    expect(resolvePoolMax({ DATABASE_POOL_MAX: "4" })).toBe(4);
  });

  it("borne la surcharge pour qu'une faute de frappe n'ouvre pas des milliers de connexions", () => {
    expect(resolvePoolMax({ DATABASE_POOL_MAX: "800" })).toBe(MAX_POOL_MAX);
  });

  it("refuse un pool plus petit qu'une connexion", () => {
    expect(resolvePoolMax({ DATABASE_POOL_MAX: "0" })).toBe(1);
    expect(resolvePoolMax({ DATABASE_POOL_MAX: "-5" })).toBe(1);
  });

  it.each(["", "   ", "huit", "8.5.1", "NaN"])(
    "retombe sur le défaut devant la valeur inexploitable %p",
    (value) => {
      expect(resolvePoolMax({ DATABASE_POOL_MAX: value })).toBe(DEFAULT_POOL_MAX);
    }
  );

  it("tronque une valeur fractionnaire plutôt que de passer un non-entier à pg", () => {
    expect(resolvePoolMax({ DATABASE_POOL_MAX: "6.9" })).toBe(6);
  });
});
