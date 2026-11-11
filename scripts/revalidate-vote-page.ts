/**
 * Revalide la page publique d'un ou plusieurs scrutins (et elle seule) après une correction
 * de résumé, de décryptage ou de titre faite en base. Passe par la vraie connexion admin.
 *
 *   node_modules/.bin/tsx --env-file=.env scripts/revalidate-vote-page.ts <slug|id> [<slug|id> ...]
 *
 * Exige ADMIN_PASSWORD dans l'environnement et --deployed : tant que la route avec `scope` n'est
 * pas déployée en production, elle ignore ce paramètre et fait la revalidation LARGE (tag votes).
 * Les titres non APPROVED sont ignorés par la route.
 */
import { db } from "@/lib/db";
import { revalidateVotePagesAsAdmin } from "@/lib/votes/admin-revalidate-client";

const BASE = "https://poligraph.fr";
const MAX = 10;

async function main(): Promise<void> {
  if (!process.argv.includes("--deployed")) {
    throw new Error(
      "Ajouter --deployed une fois la route à `scope` déployée (sinon revalidation large)."
    );
  }
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (args.length === 0 || args.length > MAX) {
    throw new Error(`Donner entre 1 et ${MAX} slugs ou identifiants de scrutin.`);
  }
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error("ADMIN_PASSWORD absent de l'environnement.");

  const rows = await db.scrutin.findMany({
    where: { OR: [{ slug: { in: args } }, { id: { in: args } }] },
    select: { id: true, slug: true },
  });
  const unknown = args.filter((a) => !rows.some((r) => r.slug === a || r.id === a));
  if (unknown.length) throw new Error(`Scrutin introuvable : ${unknown.join(", ")}`);

  const result = await revalidateVotePagesAsAdmin(
    BASE,
    password,
    rows.map((r) => r.id)
  );
  console.log(JSON.stringify(result, null, 2));
  if (result.scope !== "page") throw new Error("La route n'a pas appliqué le scope page.");
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
