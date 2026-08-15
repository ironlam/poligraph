import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const applicationSqlRoot = path.resolve("prisma/migrations");
const forbiddenGrantees = new Set(["public", "anon", "authenticated"]);

export function listApplicationSqlFiles(root = applicationSqlRoot) {
  const files = [];

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...listApplicationSqlFiles(entryPath));
    else if (entry.isFile() && entry.name.endsWith(".sql")) files.push(entryPath);
  }

  return files;
}

function stripComments(sql) {
  let result = "";
  let index = 0;

  while (index < sql.length) {
    if (sql.startsWith("--", index)) {
      const newline = sql.indexOf("\n", index + 2);
      if (newline === -1) return result;
      result += "\n";
      index = newline + 1;
      continue;
    }

    if (sql.startsWith("/*", index)) {
      const end = sql.indexOf("*/", index + 2);
      if (end === -1) return result;
      result += sql.slice(index, end + 2).replace(/[^\n]/gu, " ");
      index = end + 2;
      continue;
    }

    result += sql[index];
    index += 1;
  }

  return result;
}

function findForbiddenGrantees(clause) {
  const roles = [];

  for (const match of clause.matchAll(/"([^"]+)"|([A-Za-z_][A-Za-z_0-9]*)/gu)) {
    const role = (match[1] ?? match[2]).toLowerCase();
    if (forbiddenGrantees.has(role)) roles.push(role);
  }

  return [...new Set(roles)];
}

function appendGrantViolations(violations, file, sql, pattern, kind) {
  for (const match of sql.matchAll(pattern)) {
    for (const grantee of findForbiddenGrantees(match.groups.grantees)) {
      violations.push({ file, kind, grantee });
    }
  }
}

export function findRoutinePrivilegeViolations(files) {
  const violations = [];

  for (const [file, source] of files) {
    const relativeFile = path.relative(process.cwd(), file);
    const sql = stripComments(source);

    if (/\bSECURITY\s+DEFINER\b/iu.test(sql)) {
      violations.push({
        file: relativeFile,
        kind: "security-definer",
        grantee: null,
      });
    }

    appendGrantViolations(
      violations,
      relativeFile,
      sql,
      /\bGRANT\s+(?:EXECUTE|ALL(?:\s+PRIVILEGES)?)\s+ON\s+(?:(?:FUNCTION|PROCEDURE|ROUTINE)\b|ALL\s+(?:FUNCTIONS|PROCEDURES|ROUTINES)\s+IN\s+SCHEMA\b)[\s\S]*?\bTO\s+(?<grantees>[^;]+)/giu,
      "routine-execute-grant"
    );

    appendGrantViolations(
      violations,
      relativeFile,
      sql,
      /\bALTER\s+DEFAULT\s+PRIVILEGES\b[\s\S]*?\bGRANT\s+(?:EXECUTE|ALL(?:\s+PRIVILEGES)?)\s+ON\s+(?:FUNCTIONS|PROCEDURES|ROUTINES)\b[\s\S]*?\bTO\s+(?<grantees>[^;]+)/giu,
      "routine-default-grant"
    );
  }

  return violations;
}

function main() {
  const files = listApplicationSqlFiles().map((file) => [file, fs.readFileSync(file, "utf8")]);
  const violations = findRoutinePrivilegeViolations(files);

  if (violations.length > 0) {
    console.error(
      "SEC-06 forbids application SECURITY DEFINER routines and public-role EXECUTE grants."
    );
    for (const violation of violations) {
      const grantee = violation.grantee ? ` to ${violation.grantee}` : "";
      console.error(`- ${violation.file}: ${violation.kind}${grantee}`);
    }
    process.exit(1);
  }

  console.log("SEC-06 routine privilege source guard passed");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
