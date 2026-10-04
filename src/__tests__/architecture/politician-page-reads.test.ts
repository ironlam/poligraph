import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { createFileSystemSourceHost } from "./mcp-public-surface-graph";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const PAGE = "src/app/politiques/[slug]/page.tsx";
const PAGE_DATA = "src/app/politiques/[slug]/page-data.ts";
const BODY = "src/app/politiques/[slug]/_components/PoliticianProfileBody.tsx";

/**
 * The files that receive a value read from the profile document: the page, its helpers and every
 * component or politician helper they import, transitively. The read and write layers
 * (`profile-snapshot/`, `lib/data/`) are left out: they serialize the document, they do not render it.
 */
const DOCUMENT_FED_SCOPE = [
  "src/app/politiques/[slug]/",
  "src/components/",
  "src/lib/politicians/",
] as const;
const OUT_OF_SCOPE = ["src/lib/politicians/profile-snapshot/"] as const;

function documentFedFiles(): string[] {
  const host = createFileSystemSourceHost();
  const seen = new Set<string>();
  const queue = [PAGE, PAGE_DATA, BODY];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = host.read(file);
    if (source === undefined) continue;
    const unit = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    unit.forEachChild((node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const target = host.resolveImport(file, node.moduleSpecifier.text);
        if (
          target &&
          DOCUMENT_FED_SCOPE.some((prefix) => target.startsWith(prefix)) &&
          !OUT_OF_SCOPE.some((prefix) => target.startsWith(prefix))
        ) {
          queue.push(target);
        }
      }
    });
  }
  return [...seen];
}

const CANDIDACY = "src/lib/data/politician-candidacy.ts";

/** The source text of the body of the top-level function `name` in `file`, comments stripped. */
function functionBody(file: string, name: string): string {
  const unit = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
  let body: string | undefined;
  unit.forEachChild((node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name && node.body) {
      body = node.body.getText(unit);
    }
  });
  if (body === undefined) throw new Error(`${name} introuvable dans ${file}`);
  return withoutComments(body);
}

/** What each call in a body calls, as written: `a.b.c(` gives `a.b.c`. */
function calledFunctions(body: string): string[] {
  const unit = ts.createSourceFile("body.ts", body, ts.ScriptTarget.Latest, true);
  const calls: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) calls.push(node.expression.getText(unit));
    node.forEachChild(visit);
  };
  visit(unit);
  return calls;
}

/** Decimal columns that reach the document: `Affair.fineAmount` and the `Declaration` amounts. */
const DECIMAL_FIELDS =
  "fineAmount|realEstate|securities|bankAccounts|otherAssets|liabilities|totalNet";

/**
 * A value read from the document is JSON: a `Prisma.Decimal` comes back as a plain number, so a
 * Decimal method on it throws at render time (controller Ruling 6). Nothing in these files may
 * treat a value as a Decimal.
 */
const DECIMAL_USES: Array<[string, RegExp]> = [
  ["appel de toNumber()", /\.toNumber\(/],
  ["test instanceof Decimal", /instanceof\s+(?:Prisma\.)?Decimal\b/],
  ["test isDecimal", /\bisDecimal\(/],
  ["import de Decimal", /import[^;]*\bDecimal\b[^;]*from/],
  [
    "méthode appelée sur un champ Decimal",
    new RegExp(
      `\\b(?:${DECIMAL_FIELDS})\\??\\.(?:to\\w+|plus|minus|times|div|eq|gt|lt|gte|lte|abs)\\(`
    ),
  ],
];

describe("fiche politicien : lecture du document précalculé", () => {
  it("la fiche ne lit plus les lectures détaillées", () => {
    const sources = [PAGE, BODY].map((f) => withoutComments(read(f))).join("\n");
    expect(sources).not.toMatch(
      /getPoliticianIdentity\(|getPoliticianDossier\(|getProfileVoteStats\(/
    );
  });

  it("la page et ses métadonnées lisent le document, la candidature reste une lecture à part", () => {
    const page = withoutComments(read(PAGE));
    const pageData = withoutComments(read(PAGE_DATA));
    expect(page).toMatch(/loadPoliticianPage\(/);
    expect(page).toMatch(/getPoliticianProfile\(/);
    expect(pageData).toMatch(/getPoliticianProfile\(/);
    expect(pageData).toMatch(/getPoliticianPresidentialCandidacy\(/);
  });

  it("loadPoliticianPage ne lit rien d'autre que le document et la candidature en cache", () => {
    const calls = calledFunctions(functionBody(PAGE_DATA, "loadPoliticianPage"));
    expect(
      calls.filter(
        (c) => !["getPoliticianProfile", "getPoliticianPresidentialCandidacy"].includes(c)
      )
    ).toEqual([]);
    expect(functionBody(PAGE_DATA, "loadPoliticianPage")).not.toMatch(/\bdb\./);
  });

  it("l'id de l'élection présidentielle se lit dans une entrée de cache dédiée", () => {
    const candidacy = functionBody(CANDIDACY, "getPoliticianPresidentialCandidacy");
    // The only read before the cached candidacy is the cached election id.
    expect(candidacy).not.toMatch(/\bdb\./);
    expect(
      calledFunctions(candidacy).filter(
        (c) =>
          !["getPresidentialElectionId", "getPoliticianPresidentialCandidacyCached"].includes(c)
      )
    ).toEqual([]);
    expect(functionBody(CANDIDACY, "getPoliticianPresidentialCandidacyCached")).toMatch(
      /^\{\s*"use cache";/
    );

    const electionId = functionBody(CANDIDACY, "getPresidentialElectionId");
    expect(electionId).toMatch(/^\{\s*"use cache";/);
    expect(electionId).toMatch(/cacheTag\("election-id:presidentielle-2027"\)/);
    expect(electionId).toMatch(/cacheLife\("synced"\)/);
    // `elections` is purged after every sync: on this entry it would stale every profile.
    expect([...electionId.matchAll(/cacheTag\(([^)]*)\)/g)].map((m) => m[1])).toEqual([
      '"election-id:presidentielle-2027"',
    ]);
    expect(functionBody(CANDIDACY, "getCandidateFicheDetail")).toMatch(
      /await getPresidentialElectionId\(\)/
    );
    expect(functionBody(CANDIDACY, "getCandidateFicheDetail")).not.toMatch(/\bdb\./);
  });

  it("le corps de la fiche reçoit le document en props, sans lecture ni Suspense", () => {
    const body = withoutComments(read(BODY));
    expect(body).not.toMatch(/\bawait\b/);
    // Types from the read layer are fine; a value import would be a read.
    expect(body).not.toMatch(/^import (?!type )[^;]*from "@\/lib\/data\//m);
    expect(body).not.toMatch(/from "\.\.\/vote-stats"/);
    expect(withoutComments(read(PAGE))).not.toMatch(/<Suspense\b/);
  });

  it("les composants alimentés par le document n'appellent aucune méthode Decimal", () => {
    const files = documentFedFiles();
    // The walk must reach the components that render the document, or the check proves nothing.
    expect(files).toEqual(
      expect.arrayContaining([
        BODY,
        "src/app/politiques/[slug]/_components/PoliticianHeader.tsx",
        "src/components/politicians/AffairsSection.tsx",
        "src/components/politicians/VotesSection.tsx",
        "src/components/declarations/DeclarationCard.tsx",
        "src/lib/politicians/signals.ts",
      ])
    );

    const violations = files.flatMap((file) => {
      const source = withoutComments(read(file));
      return DECIMAL_USES.filter(([, pattern]) => pattern.test(source)).map(
        ([label]) => `${file} : ${label}`
      );
    });
    expect(violations).toEqual([]);
  });
});
