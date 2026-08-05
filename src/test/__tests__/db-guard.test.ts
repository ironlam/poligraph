import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  assertDisposableTestDb,
  assertLocalTestDb,
  describeIfDisposableDb,
  describeIfLocalDb,
  isDisposableTestDb,
  isLocalTestDb,
} from "../db-guard";

// Issue #547 — integration fixtures reached production because the gate asked
// "is there a database?" instead of "which database?". These tests pin the
// predicate, and scan the tree so the old idiom cannot come back.

describe("isLocalTestDb", () => {
  it("accepte le harness jetable", () => {
    expect(
      isLocalTestDb(
        "postgresql://poligraph_test:poligraph_test@localhost:55432/poligraph_test?sslmode=disable"
      )
    ).toBe(true);
  });

  it("accepte les formes locales sans identifiants et en IP", () => {
    expect(isLocalTestDb("postgresql://localhost:5432/poligraph_test")).toBe(true);
    expect(isLocalTestDb("postgresql://user:pass@127.0.0.1:5432/db")).toBe(true);
    expect(isLocalTestDb("postgresql://user:pass@[::1]:5432/db")).toBe(true);
  });

  it("refuse une base distante, même avec un mot de passe contenant « localhost »", () => {
    expect(isLocalTestDb("postgresql://u:p@db.supabase.co:5432/postgres")).toBe(false);
    // Le piège d'un test par sous-chaîne : « localhost » apparaît, mais l'hôte est distant.
    expect(isLocalTestDb("postgresql://u:localhost@db.supabase.co:5432/postgres")).toBe(false);
    expect(isLocalTestDb("postgresql://u:p@localhost.evil.example:5432/db")).toBe(false);
  });

  it("refuse une URL vide ou illisible", () => {
    // Une URL qu'on ne sait pas lire n'est pas une preuve d'innocuité.
    // Pas de cas `undefined` explicite : il déclencherait le paramètre par
    // défaut et testerait l'environnement courant, pas le rejet.
    expect(isLocalTestDb("")).toBe(false);
    expect(isLocalTestDb("pas-une-url")).toBe(false);
    expect(isLocalTestDb("postgresql://")).toBe(false);
  });
});

describe("assertLocalTestDb", () => {
  it.skipIf(isLocalTestDb())("lève quand la base n'est pas locale", () => {
    expect(() => assertLocalTestDb()).toThrow(/base locale/);
  });

  it.runIf(isLocalTestDb())("ne lève pas sous le harness", () => {
    expect(() => assertLocalTestDb()).not.toThrow();
  });
});

describe("describeIfLocalDb", () => {
  it.skipIf(isLocalTestDb())("n'est pas le describe ouvert quand la base n'est pas locale", () => {
    // Ignorer plutôt que lever : un bloc qui ne démarre pas n'écrit rien, donc
    // il n'y a rien à nettoyer. Un garde qui lève dans un beforeAll laisse
    // survivre les écritures déjà faites par ce même hook.
    //
    // On compare au describe ouvert, pas à describe.skip : vitest reconstruit
    // un chaînage à chaque accès, donc describe.skip n'a pas d'identité stable.
    expect(describeIfLocalDb).not.toBe(describe);
  });
});

// --- Le conteneur jetable exact, pour les suites destructrices ---------------

describe("isDisposableTestDb", () => {
  it("accepte le conteneur jetable de la recherche", () => {
    expect(
      isDisposableTestDb(
        "postgresql://poligraph_test:poligraph_test@localhost:55433/poligraph_test?sslmode=disable"
      )
    ).toBe(true);
  });

  it("refuse une autre base locale sur un autre port", () => {
    // La raison d'être de ce portail : isLocalTestDb dit oui à cette URL, et une suite
    // destructrice y lancerait ALTER TABLE puis db:push --accept-data-loss.
    expect(isDisposableTestDb("postgresql://user:pass@localhost:5432/poligraph_dev")).toBe(false);
  });

  it("refuse le harness #477, qui est un autre conteneur", () => {
    // Même nom de base, port différent, extensions différentes. « N'importe quel
    // conteneur jetable » serait une affirmation que ce module ne sait pas vérifier.
    expect(isDisposableTestDb("postgresql://poligraph_test@localhost:55432/poligraph_test")).toBe(
      false
    );
  });

  it("refuse un autre nom de base sur le bon port", () => {
    expect(isDisposableTestDb("postgresql://poligraph_test@localhost:55433/poligraph")).toBe(false);
  });

  it("refuse un hôte distant, même sur le bon port et la bonne base", () => {
    expect(
      isDisposableTestDb(
        "postgresql://u:p@aws-0-eu-west-3.pooler.supabase.com:55433/poligraph_test"
      )
    ).toBe(false);
  });

  it("refuse un tunnel local qui redirige ailleurs", () => {
    // Même forme que le conteneur, port que personne n'utiliserait pour lui. Le portail
    // ne voit pas à travers un tunnel, et c'est pour cela qu'il épingle le port.
    expect(isDisposableTestDb("postgresql://u:p@localhost:6543/poligraph_test")).toBe(false);
  });

  it("ne se laisse pas tromper par les valeurs attendues dans les identifiants", () => {
    expect(
      isDisposableTestDb("postgresql://localhost:55433:poligraph_test@db.example.com:5432/prod")
    ).toBe(false);
  });

  it("refuse une URL vide ou illisible", () => {
    expect(isDisposableTestDb("")).toBe(false);
    expect(isDisposableTestDb("pas-une-url")).toBe(false);
    expect(isDisposableTestDb("localhost:55433/poligraph_test")).toBe(false); // sans schéma
  });

  it("refuse une DATABASE_URL absente", () => {
    // Volontairement PAS écrit isDisposableTestDb(undefined) : le paramètre par défaut
    // relirait process.env, donc l'assertion passait sans base et échouait sous le
    // harness. Il faut réellement retirer la variable.
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      expect(isDisposableTestDb()).toBe(false);
    } finally {
      if (saved !== undefined) process.env.DATABASE_URL = saved;
    }
  });

  it("est strictement plus restrictif que isLocalTestDb", () => {
    // La relation qui justifie l'existence des deux : une seule définition de « local »,
    // que celle du conteneur restreint. Si un jour isDisposableTestDb acceptait une URL
    // que isLocalTestDb refuse, c'est qu'il aurait cessé de déléguer.
    const urls = [
      "postgresql://u:p@localhost:55433/poligraph_test",
      "postgresql://u:p@localhost:5432/poligraph_dev",
      "postgresql://u:p@db.example.com:55433/poligraph_test",
      "pas-une-url",
    ];
    for (const url of urls) {
      if (isDisposableTestDb(url)) expect(isLocalTestDb(url)).toBe(true);
    }
  });
});

describe("assertDisposableTestDb", () => {
  it.skipIf(isDisposableTestDb())("lève quand la base n'est pas le conteneur jetable", () => {
    expect(() => assertDisposableTestDb()).toThrow(/conteneur jetable/);
  });

  it.runIf(isDisposableTestDb())("ne lève pas sous le harness de recherche", () => {
    expect(() => assertDisposableTestDb()).not.toThrow();
  });
});

describe("describeIfDisposableDb", () => {
  it.skipIf(isDisposableTestDb())("n'est pas le describe ouvert hors du conteneur jetable", () => {
    expect(describeIfDisposableDb).not.toBe(describe);
  });
});

// --- Balayage lexical -------------------------------------------------------

const ROOTS = ["src", "scripts"];

const WRITE_PATTERN =
  /\b(?:db|tx|prisma|client)\.[a-zA-Z]+\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/;

/** L'ancien portail, qui s'ouvrait sur n'importe quelle base. */
const LEGACY_GATE = /process\.env\.DATABASE_URL\s*\?\s*describe/;

/**
 * Les deux portails acceptables : « une base locale » et, pour les suites
 * destructrices, « le conteneur jetable exact ». Le second restreint le premier, donc
 * accepter les deux ici n'affaiblit pas la règle.
 */
function hasGate(source: string): boolean {
  return source.includes("describeIfLocalDb") || source.includes("describeIfDisposableDb");
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/**
 * Only `*.integration.test.ts` is scanned, because only those connect to a real
 * database. Plenty of unit tests still gate on `process.env.DATABASE_URL` while
 * mocking the Prisma client, which reaches no database at all; deciding "is this
 * client mocked?" lexically is unreliable, and rewriting those files is unrelated
 * to this guard.
 */
function collectIntegrationTests(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules") continue;
      out.push(...collectIntegrationTests(full));
      continue;
    }
    if (entry.endsWith(".integration.test.ts")) out.push(full);
  }
  return out;
}

const relative = (f: string) => f.replace(process.cwd() + "/", "");

describe("garde : aucun test d'intégration n'écrit en base sans portail local (#547)", () => {
  const files = ROOTS.flatMap((root) => collectIntegrationTests(join(process.cwd(), root)));

  it("trouve bien des fichiers à scanner", () => {
    expect(files.length).toBeGreaterThan(3);
  });

  it("n'utilise plus le portail fondé sur la seule présence d'une base", () => {
    const offenders = files.filter((f) => LEGACY_GATE.test(stripComments(readFileSync(f, "utf8"))));

    expect(offenders.map(relative)).toEqual([]);
  });

  it("exige un portail dans tout fichier qui écrit en base", () => {
    const offenders = files.filter((f) => {
      const source = stripComments(readFileSync(f, "utf8"));
      return WRITE_PATTERN.test(source) && !hasGate(source);
    });

    expect(offenders.map(relative)).toEqual([]);
  });

  it("exige un portail dans tout fichier qui touche le client Prisma", () => {
    // La règle ci-dessus lisait vert alors que les quatre tests d'intégration du lot 1B
    // n'avaient aucun portail : ils écrivent à travers upsertSearchDocument(), donc le
    // motif `db.x.create(` ne les voyait pas. Détecter « ce test écrit » par le lexique
    // n'est pas fiable ; « ce test atteint une base » l'est, parce que `@/lib/db` est le
    // seul client du dépôt. Un test d'intégration qui atteint une base doit dire laquelle,
    // même s'il ne fait que lire : le portail existe pour qu'on ne le pointe pas sur la
    // production.
    const offenders = files.filter((f) => {
      const source = stripComments(readFileSync(f, "utf8"));
      return source.includes("@/lib/db") && !hasGate(source);
    });

    expect(offenders.map(relative)).toEqual([]);
  });

  it("couvre effectivement des fichiers qui atteignent une base", () => {
    // Même borne que ci-dessous, pour la règle qui vient d'être ajoutée : sans elle,
    // renommer tous les fichiers rendrait la règle verte et vide.
    const reachers = files.filter((f) => readFileSync(f, "utf8").includes("@/lib/db"));

    expect(reachers.length).toBeGreaterThanOrEqual(8);
  });

  it("couvre effectivement des fichiers qui écrivent, sinon la règle ne prouve rien", () => {
    // Sans cette borne, supprimer tous les tests d'intégration rendrait la règle
    // verte et vide.
    const writers = files.filter((f) => WRITE_PATTERN.test(stripComments(readFileSync(f, "utf8"))));

    expect(writers.length).toBeGreaterThanOrEqual(4);
  });
});
