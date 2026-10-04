import {
  readPoliticianDossier,
  readPoliticianIdentity,
  readProfileVoteStats,
  type PoliticianIdentity,
} from "@/lib/data/politician-profile-reads";
import type { PoliticianProfileDocument } from "./document";

/**
 * The chamber whose votes the profile shows: the current DEPUTE or SENATEUR mandate, as
 * `page.tsx` picks `currentParliamentaryMandate`. A local mandate listed first does not hide it.
 */
export function resolveProfileMandateType(
  identity: Pick<PoliticianIdentity, "mandates">
): "DEPUTE" | "SENATEUR" | null {
  const mandate = identity.mandates.find(
    (m) => m.isCurrent && (m.type === "DEPUTE" || m.type === "SENATEUR")
  );
  return mandate?.type === "DEPUTE" || mandate?.type === "SENATEUR" ? mandate.type : null;
}

/**
 * Everything `/politiques/[slug]` reads, as one document. The reads run one after the other so a
 * build holds a single pool connection at a time; null when the politician is missing or not
 * public (the reads apply the public filters themselves).
 */
export async function buildPoliticianProfileDocument(
  where: { id: string } | { slug: string }
): Promise<PoliticianProfileDocument | null> {
  const identity = await readPoliticianIdentity(where);
  if (!identity) return null;
  const dossier = await readPoliticianDossier(where);
  if (!dossier) return null;
  const mandateType = resolveProfileMandateType(identity);
  const voteStats = mandateType ? await readProfileVoteStats(identity.id, mandateType) : null;
  return { identity, dossier, voteStats, mandateType };
}
