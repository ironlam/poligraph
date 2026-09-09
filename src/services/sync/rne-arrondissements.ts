/**
 * Maires d'arrondissement et de secteur (loi PLM), issue #587.
 *
 * Ces 34 élus (Paris 17, Lyon 9, Marseille 8) manquaient entièrement : un
 * lecteur a écrit pour demander le maire du 15e arrondissement de Paris, et
 * aucune fiche ne correspondait. Le fichier des maires du RNE s'arrête aux
 * communes ; ils vivent dans le fichier des conseillers d'arrondissement,
 * repérables par leur fonction.
 *
 * Le mandat est rattaché à la commune-mère (75056, 69123, 13055) avec le
 * libellé de secteur : les secteurs qui élisent un maire ne correspondent pas
 * aux arrondissements INSEE, Paris Centre en fusionnant quatre et Marseille
 * élisant huit maires pour seize arrondissements. Créer des communes
 * d'arrondissement inventerait des mairies qui n'existent pas.
 */
import { db } from "@/lib/db";
import { DataSource, MandateType, PublicationStatus } from "@/generated/prisma";
import { HTTPClient } from "@/lib/api/http-client";
import { DATA_GOUV_RATE_LIMIT_MS } from "@/config/rate-limits";
import { generateSlug } from "@/lib/utils";
import { resolveRneResourceUrl, RNE_ARRONDISSEMENTS_FRAGMENTS } from "./rne-resource";
import {
  parseArrondissementRows,
  foldName,
  type ArrondissementMayorRow,
} from "./rne-arrondissements-parse";
import { sameCalendarDay } from "./rne-parse";

const client = new HTTPClient({ rateLimitMs: DATA_GOUV_RATE_LIMIT_MS });

export interface ArrondissementSyncStats {
  rowsParsed: number;
  mayorsFound: number;
  linkedToExisting: number;
  createdAsDraft: number;
  alreadyCurrent: number;
  errors: string[];
}

/**
 * La fiche de cette personne, ou rien.
 *
 * Prénom, nom ET date de naissance, jamais moins. La passe de juillet a montré
 * que le rapprochement sur nom plus département produisait environ la moitié de
 * faux positifs sur les élus locaux, jusqu'à rattacher un maire à un député
 * homonyme. La date de naissance, que ce fichier fournit, est ce qui manquait.
 */
async function findExactPolitician(row: ArrondissementMayorRow): Promise<string | null> {
  if (!row.birthDate) return null;
  // Filtré sur le nom, comparé sur le jour : une égalité SQL sur birthDate
  // échouerait pour tout le monde, les valeurs étant écrites à minuit Paris,
  // donc 22:00Z ou 23:00Z selon la saison.
  const candidates = await db.politician.findMany({
    where: { lastName: { equals: row.lastName, mode: "insensitive" } },
    select: { id: true, firstName: true, lastName: true, birthDate: true },
  });
  const matches = candidates.filter(
    (candidate) =>
      foldName(candidate.lastName) === foldName(row.lastName) &&
      foldName(candidate.firstName) === foldName(row.firstName) &&
      sameCalendarDay(candidate.birthDate, row.birthDate)
  );
  // Une seule fiche, sinon on s'abstient : deux homonymes nés le même jour ne se
  // départagent pas ici, et se tromper coûte plus cher qu'un doublon en DRAFT.
  return matches.length === 1 ? matches[0]!.id : null;
}

export async function syncArrondissementMayors(
  options: { dryRun?: boolean } = {}
): Promise<ArrondissementSyncStats> {
  const { dryRun = false } = options;
  const stats: ArrondissementSyncStats = {
    rowsParsed: 0,
    mayorsFound: 0,
    linkedToExisting: 0,
    createdAsDraft: 0,
    alreadyCurrent: 0,
    errors: [],
  };

  const url = await resolveRneResourceUrl(RNE_ARRONDISSEMENTS_FRAGMENTS);
  const { data: csvText } = await client.getText(url);
  const rows = parseArrondissementRows(csvText);
  stats.rowsParsed = rows.length;
  stats.mayorsFound = rows.length;

  for (const row of rows) {
    try {
      const existingMandate = await db.mandate.findFirst({
        where: {
          type: MandateType.MAIRE_ARRONDISSEMENT,
          isCurrent: true,
          localData: { sectorLabel: row.sectorLabel },
        },
        select: { id: true },
      });
      if (existingMandate) {
        stats.alreadyCurrent++;
        continue;
      }

      const politicianId = await findExactPolitician(row);

      if (dryRun) {
        if (politicianId) stats.linkedToExisting++;
        else stats.createdAsDraft++;
        continue;
      }

      const mandateData = {
        type: MandateType.MAIRE_ARRONDISSEMENT,
        title: `Maire du secteur ${row.sectorLabel}`,
        institution: "Mairie d'arrondissement",
        constituency: row.sectorLabel,
        departmentCode: row.departmentCode,
        startDate: row.mandateStart ?? new Date(),
        isCurrent: true,
        source: DataSource.RNE,
        localData: {
          create: {
            communeId: row.communeId,
            functionStart: row.functionStart,
            sectorLabel: row.sectorLabel,
          },
        },
      };

      if (politicianId) {
        await db.mandate.create({ data: { ...mandateData, politicianId } });
        stats.linkedToExisting++;
        continue;
      }

      // Inconnu au référentiel : fiche DRAFT, jamais publiée par un importeur.
      const baseSlug = generateSlug(row.fullName);
      const taken = await db.politician.findUnique({
        where: { slug: baseSlug },
        select: { id: true },
      });
      await db.politician.create({
        data: {
          slug: taken ? `${baseSlug}-${row.communeId}` : baseSlug,
          firstName: row.firstName,
          lastName: row.lastName,
          fullName: row.fullName,
          birthDate: row.birthDate,
          source: DataSource.RNE,
          publicationStatus: PublicationStatus.DRAFT,
          mandates: { create: mandateData },
        },
      });
      // Compté après l'écriture, jamais avant : une collision de publicId a
      // fait annoncer 33 créations pour 32 réelles, et un compteur qui décrit
      // l'intention plutôt que le résultat ment sans planter.
      stats.createdAsDraft++;
    } catch (error) {
      stats.errors.push(
        `${row.fullName} (${row.sectorLabel}) : ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return stats;
}
