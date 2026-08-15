import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const applicationSqlRoot = path.resolve("prisma/migrations");

// Empty by design. A future entry must identify one exact function and record
// the independently reviewed privilege boundary before the guard can permit it.
export const securityDefinerAllowlist = new Map();

function listSqlFiles(root) {
  const files = [];

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...listSqlFiles(entryPath));
    else if (entry.isFile() && entry.name.endsWith(".sql")) files.push(entryPath);
  }

  return files;
}

function stripCommentsAndBodies(sql) {
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

    if (sql[index] === "'") {
      const start = index;
      index += 1;
      while (index < sql.length) {
        if (sql[index] === "'" && sql[index + 1] === "'") {
          index += 2;
          continue;
        }
        if (sql[index] === "'") {
          index += 1;
          break;
        }
        index += 1;
      }
      result += sql.slice(start, index).replace(/[^\n]/gu, " ");
      continue;
    }

    if (sql[index] === "$") {
      const delimiter = sql.slice(index).match(/^\$[A-Za-z_0-9]*\$/u)?.[0];
      if (delimiter) {
        const end = sql.indexOf(delimiter, index + delimiter.length);
        if (end !== -1) {
          const bodyEnd = end + delimiter.length;
          result += sql.slice(index, bodyEnd).replace(/[^\n]/gu, " ");
          index = bodyEnd;
          continue;
        }
      }
    }

    result += sql[index];
    index += 1;
  }

  return result;
}

function normalizeSignature(statement) {
  const declaration = statement.match(
    /\b(?:CREATE\s+(?:OR\s+REPLACE\s+)?|ALTER\s+)FUNCTION\s+((?:"[^"]+"|[A-Za-z_][A-Za-z_0-9]*)(?:\s*\.\s*(?:"[^"]+"|[A-Za-z_][A-Za-z_0-9]*))?)\s*\(([\s\S]*?)\)/iu
  );

  if (!declaration) return "<unresolved>";

  const name = declaration[1].replace(/\s+/gu, "");
  const argumentsList = declaration[2].replace(/\s+/gu, " ").trim();
  return `${name}(${argumentsList})`;
}

function hasCompleteContract(contract) {
  if (!contract || typeof contract !== "object") return false;
  if (typeof contract.owner !== "string" || contract.owner.trim() === "") return false;
  if (typeof contract.searchPath !== "string") return false;
  if (/\$user|\bpublic\b|pg_temp/iu.test(contract.searchPath)) return false;
  if (typeof contract.justification !== "string" || contract.justification.trim() === "") {
    return false;
  }
  if (!Array.isArray(contract.executeGrantees)) return false;
  if (typeof contract.contractTest !== "string" || !contract.contractTest.startsWith("tests/")) {
    return false;
  }
  return true;
}

export function findSecurityDefinerViolations(files, allowlist = securityDefinerAllowlist) {
  const violations = [];
  const matchedAllowlistKeys = new Set();

  for (const [file, sql] of files) {
    const relativeFile = path.relative(process.cwd(), file);
    const statements = stripCommentsAndBodies(sql).split(";");

    for (const statement of statements) {
      if (!/\bSECURITY\s+DEFINER\b/iu.test(statement)) continue;

      const signature = normalizeSignature(statement);
      const key = `${relativeFile}::${signature}`;
      const contract = allowlist.get(key);

      if (!hasCompleteContract(contract)) {
        violations.push({ file: relativeFile, signature, reason: "missing reviewed allowlist" });
        continue;
      }

      matchedAllowlistKeys.add(key);
    }
  }

  for (const [key, contract] of allowlist) {
    if (!hasCompleteContract(contract)) {
      violations.push({ file: key, signature: "<allowlist>", reason: "incomplete contract" });
    } else if (!matchedAllowlistKeys.has(key)) {
      violations.push({ file: key, signature: "<allowlist>", reason: "stale allowlist entry" });
    }
  }

  return violations;
}

function main() {
  const files = listSqlFiles(applicationSqlRoot).map((file) => [
    file,
    fs.readFileSync(file, "utf8"),
  ]);
  const violations = findSecurityDefinerViolations(files);

  if (violations.length > 0) {
    console.error("SEC-06 forbids unreviewed SECURITY DEFINER application functions.");
    for (const violation of violations) {
      console.error(`- ${violation.file}: ${violation.signature} (${violation.reason})`);
    }
    process.exit(1);
  }

  console.log("SEC-06 SECURITY DEFINER guard passed");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
