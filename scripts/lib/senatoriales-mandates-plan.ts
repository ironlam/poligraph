/**
 * The switch of series-2 mandates on 1 October 2026, decided without the database.
 *
 * The outgoing seats come from the snapshot captured before the ballot, the elected
 * people from the imported results. Every outgoing seat is handled exactly once: closed
 * on 30 September, or renewed (closed, then a 2026 to 2032 term opened) when its holder
 * was re-elected. Nobody is matched here by name: an elected person with no record stays
 * a manual action.
 */

import type { ElectedSenator } from "@/lib/senatoriales/results-summary";
import { FEHF_FEED_CODE } from "@/lib/senatoriales/results-feed";
import type { OutgoingSenateSeat } from "@/types/stats-snapshots";

/** Same convention as `SERIES_TERM_START_ISO` in `src/config/senatoriales.ts`. */
export const TERM_2026_START = new Date("2026-10-01T00:00:00Z");
export const TERM_2020_END = new Date("2026-09-30T00:00:00Z");
const RENEWED_CONSTITUENCIES = 64;

export type MandateAction =
  | { kind: "close"; mandateId: string; endDate: Date }
  | { kind: "renew"; closeMandateId: string; politicianId: string; departmentCode: string | null }
  | { kind: "open"; politicianId: string; departmentCode: string | null }
  | { kind: "manual"; name: string; constituencyCode: string };

function departmentOf(constituencyCode: string): string | null {
  return constituencyCode === FEHF_FEED_CODE ? null : constituencyCode;
}

export function planMandates(input: {
  elected: ElectedSenator[];
  outgoing: OutgoingSenateSeat[];
  currentSeries2Mandates: Array<{ id: string; politicianId: string }>;
  /** People who already hold a 2026 term: a second run leaves them alone. */
  alreadyOpened?: Set<string>;
}): MandateAction[] {
  const alreadyOpened = input.alreadyOpened ?? new Set<string>();
  const mandateOf = new Map(input.currentSeries2Mandates.map((m) => [m.politicianId, m.id]));
  const electedById = new Map(
    input.elected.filter((e) => e.politicianId).map((e) => [e.politicianId!, e])
  );
  const outgoingIds = new Set(input.outgoing.map((s) => s.politicianId));
  const actions: MandateAction[] = [];

  for (const seat of input.outgoing) {
    if (alreadyOpened.has(seat.politicianId)) continue;
    const mandateId = mandateOf.get(seat.politicianId);
    const reelected = electedById.get(seat.politicianId);
    if (reelected) {
      const departmentCode = departmentOf(reelected.constituencyCode);
      actions.push(
        mandateId
          ? {
              kind: "renew",
              closeMandateId: mandateId,
              politicianId: seat.politicianId,
              departmentCode,
            }
          : { kind: "open", politicianId: seat.politicianId, departmentCode }
      );
    } else if (mandateId) {
      actions.push({ kind: "close", mandateId, endDate: TERM_2020_END });
    }
  }

  for (const e of input.elected) {
    if (e.politicianId === null) {
      actions.push({ kind: "manual", name: e.name, constituencyCode: e.constituencyCode });
    } else if (!outgoingIds.has(e.politicianId) && !alreadyOpened.has(e.politicianId)) {
      actions.push({
        kind: "open",
        politicianId: e.politicianId,
        departmentCode: departmentOf(e.constituencyCode),
      });
    }
  }
  return actions;
}

export function assertReadyToSwitch(now: Date, publishedConstituencies: number): void {
  if (now < TERM_2026_START) {
    throw new Error("Les mandats de 2026 commencent le 1er octobre : bascule refusée avant.");
  }
  if (publishedConstituencies < RENEWED_CONSTITUENCIES) {
    throw new Error(
      `Circonscriptions publiées : ${publishedConstituencies} sur ${RENEWED_CONSTITUENCIES}. ` +
        "Bascule refusée tant que le renouvellement n'est pas complet."
    );
  }
}

export interface OutgoingMandate {
  politicianId: string;
  title: string;
  constituency: string | null;
  departmentCode: string | null;
  externalId: string | null;
  sourceUrl: string | null;
  officialUrl: string | null;
}

/**
 * The 2026 to 2032 term of a re-elected senator. It takes over the old mandate's
 * `externalId`, because `syncSenator()` looks a mandate up by `externalId` before it looks
 * for the current one: left on the closed 2020 mandate, the identifier would make the next
 * sync reopen it next to the new one.
 */
export function renewedMandateData(old: OutgoingMandate) {
  return {
    politicianId: old.politicianId,
    type: "SENATEUR" as const,
    institution: "Sénat",
    title: old.title,
    constituency: old.constituency,
    departmentCode: old.departmentCode,
    externalId: old.externalId,
    sourceUrl: old.sourceUrl,
    officialUrl: old.officialUrl,
    senateSeries: 2,
    startDate: TERM_2026_START,
    isCurrent: true,
    source: "SENAT" as const,
  };
}

export function closedMandatePatch({ transferExternalId }: { transferExternalId: boolean }) {
  return transferExternalId
    ? { isCurrent: false, endDate: TERM_2020_END, externalId: null }
    : { isCurrent: false, endDate: TERM_2020_END };
}
