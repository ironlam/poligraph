import { db } from "@/lib/db";
import {
  JURIDICTIONS_FINANCIERES,
  type JuridictionFinanciere,
} from "@/config/juridictions-financieres";
import { fetchFluxJuridiction, fetchPagePublication } from "@/lib/api/ccomptes";
import {
  departementParNom,
  parseDocumentRapportCrc,
  parseTitreRapportCrc,
  rattacherRapport,
  type TerritoireRapport,
} from "@/lib/territoires/rapports-crc";
import { recordEvenements, type EvenementDraft } from "@/services/sync/territoire-evenements";

/**
 * Notices of the regional audit chambers' reports (Territoires v2, lot C).
 *
 * Reads the feed of each chamber of the closed list, keeps the publications whose title opens on
 * a commune, a department or a region, reads the page of each new one for its kind of document,
 * and keeps the final observations reports. Every notice is written as a DRAFT: the territory is
 * a proposal that a person confirms, corrects or rejects in /admin/territoires/rapports-crc.
 * The idempotence key is the report address: a report already in base is not fetched again.
 * Only reports published since `depuis` are kept (30 days by default): a feed can still list a
 * report from 2009, and taking in the past is a decision of its own.
 */

export type MotifEcart =
  | "HORS_COLLECTIVITE"
  | "ANTERIEUR"
  | "DEJA_EN_BASE"
  | "AVIS_BUDGETAIRE"
  | "AUTRE_DOCUMENT"
  | "PAGE_ILLISIBLE";

export interface RapportsCrcResult {
  chambresLues: number;
  chambresEnErreur: string[];
  publications: number;
  ecartes: Partial<Record<MotifEcart, number>>;
  notices: Array<EvenementDraft & { titre: string; rattachement: TerritoireRapport["motif"] }>;
  written: number;
}

/** "2026-11-21" in Paris for an instant of the feed: the day the chamber published. */
function jourDeParis(instant: Date): Date {
  return new Date(`${instant.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" })}T00:00:00Z`);
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function syncRapportsCrc(
  options: { dryRun: boolean; depuis?: Date; pauseMs?: number } = { dryRun: true }
): Promise<RapportsCrcResult> {
  const pauseMs = options.pauseMs ?? 500;
  const depuis = options.depuis ?? new Date(Date.now() - 30 * 86_400_000);
  const result: RapportsCrcResult = {
    chambresLues: 0,
    chambresEnErreur: [],
    publications: 0,
    ecartes: {},
    notices: [],
    written: 0,
  };
  const ecarter = (motif: MotifEcart) => {
    result.ecartes[motif] = (result.ecartes[motif] ?? 0) + 1;
  };

  // 1. Feeds, one chamber at a time.
  const candidats: Array<{
    juridiction: JuridictionFinanciere;
    titre: string;
    url: string;
    publieLe: Date;
    collectivite: NonNullable<ReturnType<typeof parseTitreRapportCrc>["collectivite"]>;
    cahier: number | null;
  }> = [];
  for (const juridiction of JURIDICTIONS_FINANCIERES) {
    try {
      const flux = await fetchFluxJuridiction(juridiction.id);
      result.chambresLues++;
      for (const p of flux.publications) {
        result.publications++;
        const lu = parseTitreRapportCrc(p.titre);
        if (!lu.collectivite) ecarter("HORS_COLLECTIVITE");
        else if (p.publieLe < depuis) ecarter("ANTERIEUR");
        else
          candidats.push({ juridiction, ...p, collectivite: lu.collectivite, cahier: lu.cahier });
      }
    } catch (error) {
      result.chambresEnErreur.push(`${juridiction.nom} : ${String(error)}`);
    }
    await pause(pauseMs);
  }

  // 2. Reports already in base are not fetched again.
  const dedupeKey = (url: string) => `rapport-crc:${url}`;
  const existants = new Set(
    (
      await db.territoireEvenement.findMany({
        where: { dedupeKey: { in: candidats.map((c) => dedupeKey(c.url)) } },
        select: { dedupeKey: true },
      })
    ).map((e) => e.dedupeKey)
  );

  const nouveaux = candidats.filter((c) => !existants.has(dedupeKey(c.url)));
  for (let i = nouveaux.length; i < candidats.length; i++) ecarter("DEJA_EN_BASE");

  // 3. Communes of the departments the titles name, for the exact-name proposal.
  const codes = new Set<string>();
  for (const c of nouveaux) {
    const dep = c.collectivite.type === "COMMUNE" && c.collectivite.departement;
    const code = dep ? departementParNom(dep) : null;
    if (code) codes.add(code);
  }
  const communes = new Map<string, Array<{ id: string; name: string }>>();
  if (codes.size > 0) {
    const rows = await db.commune.findMany({
      where: { departmentCode: { in: [...codes] } },
      select: { id: true, name: true, departmentCode: true },
    });
    for (const row of rows) {
      const liste = communes.get(row.departmentCode) ?? [];
      liste.push(row);
      communes.set(row.departmentCode, liste);
    }
  }

  // 4. The page of each new report, for its kind of document.
  for (const c of nouveaux) {
    let document;
    try {
      document = parseDocumentRapportCrc(await fetchPagePublication(c.url));
    } catch {
      document = null;
    }
    await pause(pauseMs);
    if (document === null) ecarter("PAGE_ILLISIBLE");
    else if (document === "AVIS_BUDGETAIRE") ecarter("AVIS_BUDGETAIRE");
    else if (document === "AUTRE") ecarter("AUTRE_DOCUMENT");
    if (document !== "RAPPORT_OBSERVATIONS_DEFINITIVES") continue;

    const territoire = rattacherRapport(c.collectivite, (dep) => communes.get(dep) ?? []);
    result.notices.push({
      territoryType: territoire.territoryType,
      territoryCode: territoire.territoryCode,
      occurredOn: jourDeParis(c.publieLe),
      payload: {
        type: "RAPPORT_CRC",
        juridictionId: c.juridiction.id,
        document,
        collectivite: c.collectivite.libelle,
        cahier: c.cahier,
        titre: c.titre,
      },
      sourceLabel: `${c.juridiction.type === "CRC" ? "Chambre régionale" : "Chambre territoriale"} des comptes ${c.juridiction.nom}`,
      sourceUrl: c.url,
      status: "DRAFT",
      dedupeKey: dedupeKey(c.url),
      titre: c.titre,
      rattachement: territoire.motif,
    });
  }

  if (!options.dryRun && result.notices.length > 0) {
    result.written = (await recordEvenements(result.notices)).written;
  }
  return result;
}
