import fs from "node:fs";
import path from "node:path";
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
    expect(resolveConnectionTimeout(true)).toBe(WEB_CONNECTION_TIMEOUT_MS);
  });

  it("laisse un script ou un job attendre, faute de visiteur derrière", () => {
    expect(resolveConnectionTimeout(false)).toBe(BATCH_CONNECTION_TIMEOUT_MS);
  });

  /**
   * L'ancien seuil de 8 s disait « ce qu'un visiteur tolère », mais il n'a jamais été appliqué :
   * la production tournait à 30 s. La production a donc mesuré ce que l'assertion supposait, et
   * POLIGRAPH-2X rapporte des attentes réelles de 5648 ms. Un plafond en dessous transformerait
   * ces rendus en erreurs, ce qui est pire qu'une page lente. L'assertion borne maintenant ce
   * qu'on sait : au-dessus du pire cas observé, en dessous du budget d'un job.
   */
  it("garde le budget web au-dessus du pire cas observé et sous celui d'un job", () => {
    expect(WEB_CONNECTION_TIMEOUT_MS).toBeGreaterThan(5_648);
    expect(WEB_CONNECTION_TIMEOUT_MS).toBeLessThan(BATCH_CONNECTION_TIMEOUT_MS);
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

/**
 * Le bug que cette suite n'a pas vu, et ne pouvait pas voir.
 *
 * Next remplace le texte littéral `process.env.NEXT_RUNTIME` à la compilation
 * (`next/dist/build/define-env.js`). Une lecture indirecte, `env.NEXT_RUNTIME` avec `env` reçu en
 * paramètre, échappe à cette substitution, et sur Vercel rien d'autre ne pose la variable : seul
 * le binaire `next` le fait. Le budget web n'a donc jamais été appliqué en production, pendant que
 * chaque test, lui, tournait non bundlé contre un vrai `process.env` et passait.
 *
 * Aucune assertion d'exécution ne peut rattraper ça, puisque l'écart naît du bundler. D'où un
 * contrôle sur le texte source.
 */
describe("lecture de NEXT_RUNTIME", () => {
  const SOURCES = [
    "src/lib/db.ts",
    "src/config/database.ts",
    "src/lib/telemetry/pg-pool.ts",
    "src/instrumentation.ts",
  ];

  /** Retire commentaires de bloc et de ligne, où la variable est citée en prose. */
  function withoutComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  }

  it.each(SOURCES)("%s ne lit NEXT_RUNTIME que par le littéral que le build substitue", (file) => {
    const code = withoutComments(fs.readFileSync(path.join(process.cwd(), file), "utf8"));
    const lectures = [...code.matchAll(/[\w.[\]"'`]*NEXT_RUNTIME/g)].map((m) => m[0]);
    for (const lecture of lectures) {
      expect(lecture, `${file} lit NEXT_RUNTIME autrement que par process.env`).toBe(
        "process.env.NEXT_RUNTIME"
      );
    }
  });

  /** Le contrôle ci-dessus ne vaut que s'il voit quelque chose. */
  it("voit bien des lectures à contrôler", () => {
    const total = SOURCES.reduce((n, file) => {
      const code = withoutComments(fs.readFileSync(path.join(process.cwd(), file), "utf8"));
      return n + [...code.matchAll(/NEXT_RUNTIME/g)].length;
    }, 0);
    expect(total).toBeGreaterThanOrEqual(4);
  });
});
