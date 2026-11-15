import "dotenv/config";
import { syncResultatsCsv } from "../src/services/sync/resultats-csv";

const dryRun = process.argv.includes("--dry-run");
const deptArg = process.argv.find((a) => a.startsWith("--dept="));
const dept = deptArg ? deptArg.split("=")[1]! : undefined;
const roundArg = process.argv.find((a) => a.startsWith("--round="));
const round = roundArg ? (parseInt(roundArg.split("=")[1]!, 10) as 1 | 2) : 1;

const seatsOnly = process.argv.includes("--seats-only");

syncResultatsCsv({ dryRun, dept, round, seatsOnly });
