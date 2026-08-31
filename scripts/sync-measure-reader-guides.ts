import { MEASURE_READER_GUIDES } from "../src/config/measure-reader-guides";
import { syncReaderGuideCatalog } from "../src/lib/measures/reader-guides";
import { parseCLIOptions } from "../src/lib/cli/parse-options";

async function main(): Promise<void> {
  const parsed = parseCLIOptions(process.argv.slice(2), [{ name: "--apply", type: "boolean" }]);
  const apply = parsed.apply === true;
  if (!apply) {
    console.log(`${MEASURE_READER_GUIDES.length} repère(s) du catalogue à synchroniser.`);
    console.log("Simulation uniquement. Ajouter --apply pour créer ou actualiser les brouillons.");
    return;
  }
  const result = await syncReaderGuideCatalog("cli:sync-reader-guides");
  console.log(
    `${result.created} créé(s), ${result.updated} actualisé(s), ${result.preserved} publié(s) préservé(s).`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
