import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { assertLocalTestDb, describeIfLocalDb, isLocalTestDb } from "../db-guard";

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

// --- Balayage lexical -------------------------------------------------------

const ROOTS = ["src", "scripts"];

const WRITE_PATTERN =
  /\b(?:db|tx|prisma|client)\.[a-zA-Z]+\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/;

/** L'ancien portail, qui s'ouvrait sur n'importe quelle base. */
const LEGACY_GATE = /process\.env\.DATABASE_URL\s*\?\s*describe/;

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

  it("exige describeIfLocalDb dans tout fichier qui écrit en base", () => {
    const offenders = files.filter((f) => {
      const source = stripComments(readFileSync(f, "utf8"));
      return WRITE_PATTERN.test(source) && !source.includes("describeIfLocalDb");
    });

    expect(offenders.map(relative)).toEqual([]);
  });

  it("couvre effectivement des fichiers qui écrivent, sinon la règle ne prouve rien", () => {
    // Sans cette borne, supprimer tous les tests d'intégration rendrait la règle
    // verte et vide.
    const writers = files.filter((f) => WRITE_PATTERN.test(stripComments(readFileSync(f, "utf8"))));

    expect(writers.length).toBeGreaterThanOrEqual(4);
  });
});
