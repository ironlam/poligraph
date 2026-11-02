#!/usr/bin/env tsx
/**
 * Construit la feuille de 30 paires à juger à la main à partir de proposals.jsonl.
 *   npx tsx scripts/poc-build-reference.ts --in=poc-out/proposals.jsonl --out=poc-out/reference.json
 * Remplir `expected` (SAME_OBJECT, BROADER_TEXT ou NONE), puis relancer le POC avec --reference.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  buildReferenceSheet,
  type ProposalRecord,
} from "@/lib/measures/parliament-matching/matching";

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const input = arg("in");
const output = arg("out");
if (!input || !output) throw new Error("--in et --out sont requis");

const records = readFileSync(input, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line) as ProposalRecord);
const sheet = buildReferenceSheet(records);
writeFileSync(output, JSON.stringify(sheet, null, 2));
console.log(`[reference] ${sheet.length} paires écrites dans ${output}`);
