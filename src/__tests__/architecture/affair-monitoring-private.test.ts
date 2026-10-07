import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Le suivi éditorial des affaires est privé : aucune lecture publique ne doit le toucher. Seuls
 * l'admin, le module de suivi, ses tâches planifiées et les deux gardes de publication
 * référencent le modèle.
 */

// Les modèles et leur table de contrôles, la relation `monitoring:` quelle que soit sa valeur, et
// tout import du module de suivi.
const MONITORING_PATTERN =
  /\b[aA]ffairMonitoring(Check)?\b|"AffairMonitoring(Check)?"|\bmonitoring\s*:|affairs\/monitoring\//;

const ALLOWED_PREFIXES = [
  "src/app/admin/",
  "src/app/api/admin/",
  "src/components/admin/",
  "src/lib/admin/",
  "src/lib/affairs/monitoring/",
  "src/services/affairs/monitoring/",
  "src/inngest/functions/affair-monitoring-",
  "src/inngest/index.ts",
  "src/lib/affairs/publish-guard.ts",
  "src/services/affairs/proposal-review.ts",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || path === "src/generated") continue;
      walk(path, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

const files = walk("src");

describe("suivi des affaires : confidentialité", () => {
  it("n'est référencé que par les chemins autorisés", () => {
    const offenders = files
      .filter((file) => !ALLOWED_PREFIXES.some((prefix) => file.startsWith(prefix)))
      .flatMap((file) =>
        readFileSync(file, "utf8")
          .split("\n")
          .flatMap((line, index) => (MONITORING_PATTERN.test(line) ? [`${file}:${index + 1}`] : []))
      );
    expect(offenders).toEqual([]);
  });

  it("contrôle positif : le scanner lit bien un fichier de suivi", () => {
    const file = "src/lib/affairs/monitoring/queries.ts";
    expect(files).toContain(file);
    expect(MONITORING_PATTERN.test(readFileSync(file, "utf8"))).toBe(true);
  });
});
