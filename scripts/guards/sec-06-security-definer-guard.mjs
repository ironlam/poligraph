import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const applicationSqlRoot = path.resolve("prisma/migrations");
const forbiddenGrantees = new Set(["public", "anon", "authenticated"]);
const sec06Migration = "prisma/migrations/20260815170649_sec_06_function_privileges/migration.sql";
const boundedDynamicSql = new Map([
  [
    sec06Migration,
    /\bEXECUTE\s+format\(\s*'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',\s*resolved_signature\s*\)/iu,
  ],
  [
    "prisma/migrations/manual/enable_rls_all_tables.sql",
    /\bEXECUTE\s+format\(\s*'ALTER TABLE %s ENABLE ROW LEVEL SECURITY',\s*obj\.object_identity\s*\)/iu,
  ],
]);

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

function findDynamicExecuteOffsets(sql) {
  const offsets = [];

  for (const match of sql.matchAll(/\bEXECUTE\b/giu)) {
    const before = sql.slice(Math.max(0, match.index - 24), match.index);
    const after = sql.slice(match.index + match[0].length, match.index + match[0].length + 24);

    if (/\b(?:GRANT|REVOKE)\s*$/iu.test(before)) continue;
    if (/^\s+FUNCTION\b/iu.test(after)) continue;
    offsets.push(match.index);
  }

  return offsets;
}

export function findRoutinePrivilegeViolations(files) {
  const violations = [];

  for (const [file, source] of files) {
    const relativeFile = path.relative(process.cwd(), file);
    const sql = stripComments(source);
    const dynamicExecuteOffsets = findDynamicExecuteOffsets(sql);
    const doBlockCount = [...sql.matchAll(/\bDO\s+\$[A-Za-z_0-9]*\$/giu)].length;
    const expectedDynamicSql = boundedDynamicSql.get(relativeFile);

    if (
      dynamicExecuteOffsets.length > 0 &&
      (!expectedDynamicSql || dynamicExecuteOffsets.length !== 1 || !expectedDynamicSql.test(sql))
    ) {
      violations.push({ file: relativeFile, kind: "unbounded-dynamic-sql", grantee: null });
    }

    if (doBlockCount > 0 && (relativeFile !== sec06Migration || doBlockCount !== 1)) {
      violations.push({ file: relativeFile, kind: "unbounded-do-block", grantee: null });
    }

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
