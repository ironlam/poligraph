/** Offline, source-only comparison for #564. No database or network writes. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import AdmZip from "adm-zip";
import { auditGovernmentSupport } from "../src/services/audit/government-support";

const { values } = parseArgs({
  options: {
    scrutins: { type: "string" },
    dossiers: { type: "string" },
    out: { type: "string", default: ".tmp/issue-564/audit" },
  },
  strict: true,
});
if (!values.scrutins || !values.dossiers) {
  throw new Error(
    "Usage: npm run audit:government-support -- --scrutins archive.zip --dossiers archive.zip [--out dossier]"
  );
}

function readArchive(file: string, sourceUrl: string, prefix: string) {
  const bytes = readFileSync(file);
  const entries = new AdmZip(bytes)
    .getEntries()
    .filter((entry) => entry.entryName.startsWith(prefix) && entry.entryName.endsWith(".json"))
    .sort((a, b) => a.entryName.localeCompare(b.entryName));
  if (!entries.length) throw new Error(`Archive sans JSON attendu : ${file}`);
  return {
    manifest: {
      sourceUrl,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
      fileModifiedAt: statSync(file).mtime.toISOString(),
      jsonFiles: entries.length,
    },
    records: entries.map((entry): unknown => JSON.parse(entry.getData().toString("utf8"))),
  };
}

const base = "https://data.assemblee-nationale.fr/static/openData/repository/17/loi";
const scrutins = readArchive(values.scrutins, `${base}/scrutins/Scrutins.json.zip`, "json/");
const dossiers = readArchive(
  values.dossiers,
  `${base}/dossiers_legislatifs/Dossiers_Legislatifs.json.zip`,
  "json/dossierParlementaire/"
);
const audit = auditGovernmentSupport(scrutins.records, dossiers.records);
const report = {
  method: "issue-564-source-audit-v1",
  auditedAt: new Date().toISOString(),
  legislature: 17,
  scope: "Archives officielles uniquement, état de la base Poligraph non vérifié",
  sources: { scrutins: scrutins.manifest, dossiers: dossiers.manifest },
  ...audit,
};
const out = path.resolve(values.out);
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "audit.json"), JSON.stringify(report, null, 2) + "\n");
const escapeCell = (value: unknown) =>
  String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/[\r\n]+/g, " ");
const list = (rows: typeof audit.rows) =>
  rows
    .map(
      (row) =>
        `| [${row.uid}](${row.sourceUrl}) | ${row.date} | ${row.codeTypeVote ?? "inconnu"} | ${escapeCell(row.title)} | ${escapeCell(row.dossierId)} | ${row.resolution} | ${row.exclusion ?? "INCLUS"} |`
    )
    .join("\n");
const header =
  "| Scrutin | Date | Type | Objet officiel | Dossier | Rattachement | Motif |\n| --- | --- | --- | --- | --- | --- | --- |";
const markdown = [
  "# Audit source #564 : votes sur l'ensemble des projets gouvernementaux",
  "",
  `Exécuté le ${report.auditedAt}. Législature 17. Aucun accès à la base de données.`,
  "",
  "Le corpus confirmé exige un vote d'ensemble, une origine gouvernementale établie et une référence voteRef unique. Les rapprochements par séance ou titre restent à vérifier, même si le résolveur existant propose un dossier.",
  "",
  "```json",
  JSON.stringify(report.summary, null, 2),
  "```",
  "",
  "## Scrutins du corpus confirmé écartés par le seul filtre SPS",
  "",
  header,
  list(audit.rows.filter((row) => row.inAll && !row.inSps)),
  "",
  "## Tous les candidats, y compris les objets partiels et les cas à vérifier",
  "",
  header,
  list(audit.rows.filter((row) => row.candidate)),
  "",
  "## Provenance reproductible",
  "",
  "```json",
  JSON.stringify(report.sources, null, 2),
  "```",
  "",
  "L'export audit.json contient une ligne par scrutin, les décomptes par organeRef et les anomalies. Les archives doivent être conservées avec ce rapport : les URL sont mises à jour par l'Assemblée. Les dates de modification sont celles des fichiers locaux, pas celles des données source. Aucun taux de soutien n'est publié par cet audit.",
  "",
].join("\n");
writeFileSync(path.join(out, "audit.md"), markdown);
console.log(JSON.stringify(report.summary, null, 2));
console.log(`Rapport : ${path.join(out, "audit.md")}`);
