import { describe, expect, it } from "vitest";
import {
  PRISMA_TRANSACTION_OPTIONS,
  resolvePoolMax,
  DEFAULT_POOL_MAX,
  MAX_POOL_MAX,
  MIN_POOL_MAX,
  SUPAVISOR_BACKENDS,
  WEB_CONNECTION_TIMEOUT_MS,
  BATCH_CONNECTION_TIMEOUT_MS,
  resolveConnectionTimeout,
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
    // Un pool de 4 a servi 16 rendus concurrents sans un seul refus ; à 3 il en restait un.
    expect(resolvePoolMax({})).toBe(DEFAULT_POOL_MAX);
    expect(DEFAULT_POOL_MAX).toBeGreaterThan(2);
  });

  it("se laisse surcharger", () => {
    expect(resolvePoolMax({ DATABASE_POOL_MAX: "3" })).toBe(3);
  });

  it("laisse un seul processus incapable de monopoliser les backends partagés", () => {
    // Les 15 backends de Supavisor sont partagés par le site, les workers de build, Inngest et les
    // scripts batch. Un pool aussi large que ce chiffre laisserait un seul processus les prendre
    // tous, et les autres attendraient dans la file du pooler sans jamais voir d'erreur franche.
    expect(DEFAULT_POOL_MAX).toBeLessThan(SUPAVISOR_BACKENDS);
    expect(MAX_POOL_MAX).toBeLessThan(SUPAVISOR_BACKENDS);
  });

  it("borne la surcharge pour qu'une faute de frappe n'ouvre pas des milliers de connexions", () => {
    expect(resolvePoolMax({ DATABASE_POOL_MAX: "800" })).toBe(MAX_POOL_MAX);
  });

  it("ne descend jamais sous deux, sinon withAdvisoryLock se bloque lui-même", () => {
    // Le verrou garde un client pour tout son callback, et le callback requête le même pool.
    for (const value of ["1", "0", "-5"]) {
      expect(resolvePoolMax({ DATABASE_POOL_MAX: value })).toBe(MIN_POOL_MAX);
    }
    expect(MIN_POOL_MAX).toBe(2);
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

describe("resolveConnectionTimeout", () => {
  /**
   * Un seul délai servait la requête d'un visiteur, un job Inngest et un script batch. Cinq
   * secondes n'ont de sens que pour le premier : un sync a le droit d'attendre une connexion,
   * personne ne regarde l'écran.
   */
  it("donne au runtime Next le budget d'un visiteur", () => {
    expect(resolveConnectionTimeout({ NEXT_RUNTIME: "nodejs" })).toBe(WEB_CONNECTION_TIMEOUT_MS);
    expect(resolveConnectionTimeout({ NEXT_RUNTIME: "edge" })).toBe(WEB_CONNECTION_TIMEOUT_MS);
  });

  it("laisse un script ou un job attendre, faute de visiteur derrière", () => {
    expect(resolveConnectionTimeout({})).toBe(BATCH_CONNECTION_TIMEOUT_MS);
  });

  it("garde le budget web sous ce qu'un visiteur tolère", () => {
    expect(WEB_CONNECTION_TIMEOUT_MS).toBeLessThanOrEqual(8_000);
  });

  /**
   * La file la plus longue jamais mesurée est de 9,2 s (staging, pool de 4, 16 rendus tenant
   * chacun une connexion 3 s). Un job doit l'absorber, sinon le budget transforme une attente
   * connue en échec.
   */
  it("laisse le budget batch au-dessus de la file la plus longue mesurée", () => {
    expect(BATCH_CONNECTION_TIMEOUT_MS).toBeGreaterThan(9_200);
  });
});
