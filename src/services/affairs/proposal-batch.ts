import { parseAffairProposalPayload } from "@/lib/security/schemas/affair-proposal";

export interface ProposalBatchCandidate {
  id: string;
  proposedPatch: unknown;
}

export interface ProposalBatchPage {
  skip: number;
  take: number;
}

/**
 * Reads through the whole filtered queue until the requested number of eligible
 * proposals has been collected. The database limit therefore cannot be consumed
 * entirely by event proposals that the operator did not opt into.
 */
export async function collectProposalCandidatesForBatch<T extends ProposalBatchCandidate>(
  fetchPage: (page: ProposalBatchPage) => Promise<T[]>,
  limit: number,
  includeEvents: boolean,
  pageSize = 500
): Promise<{ rows: T[]; excludedEvents: number }> {
  const rows: T[] = [];
  let excludedEvents = 0;
  let skip = 0;

  while (rows.length < limit) {
    const page = await fetchPage({ skip, take: pageSize });
    if (page.length === 0) break;
    skip += page.length;

    for (const candidate of page) {
      if (!includeEvents && isEventProposal(candidate.proposedPatch)) {
        excludedEvents++;
        continue;
      }
      rows.push(candidate);
      if (rows.length === limit) break;
    }

    if (page.length < pageSize) break;
  }

  return { rows, excludedEvents };
}

function isEventProposal(raw: unknown): boolean {
  try {
    return parseAffairProposalPayload(raw).kind === "ADD_EVENT";
  } catch {
    return false;
  }
}

/** Keeps HIGH-risk event additions out of every generic multi-ID acceptance. */
export function selectProposalIdsForBatch(
  requestedIds: readonly string[],
  candidates: readonly ProposalBatchCandidate[],
  includeEvents: boolean
): { acceptedIds: string[]; excludedEventIds: string[] } {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const excludedEventIds = includeEvents
    ? []
    : requestedIds.filter((id) => {
        const candidate = byId.get(id);
        if (!candidate) return false;
        try {
          return parseAffairProposalPayload(candidate.proposedPatch).kind === "ADD_EVENT";
        } catch {
          return false;
        }
      });
  const excluded = new Set(excludedEventIds);
  return {
    acceptedIds: requestedIds.filter((id) => !excluded.has(id)),
    excludedEventIds,
  };
}
