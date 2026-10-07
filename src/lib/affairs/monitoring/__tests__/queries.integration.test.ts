import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import type {
  AffairStatus,
  MonitoringDueReason,
  MonitoringFlag,
  Involvement,
  PublicationStatus,
} from "@/generated/prisma";
import { parisDay } from "../cadence";
import { needsHumanReason, type NeedsHumanReason } from "../needs-human";

let db: typeof import("@/lib/db").db;
let queries: typeof import("../queries");

const DAY_MS = 24 * 60 * 60 * 1000;
// Fixed clock: every query below receives it, so the test never depends on the wall clock.
const NOW = new Date("2026-10-07T10:00:00Z");

it("garde le test PostgreSQL derrière le garde de base jetable", () => {
  expect(describeIfDisposableDb).toBeDefined();
});

type Case = {
  key: string;
  publication?: PublicationStatus;
  involvement?: Involvement;
  offsetDays: number;
  dueReason: MonitoringDueReason;
  flagged?: MonitoringFlag;
  active?: boolean;
};

const CASES: Case[] = [
  { key: "signal", offsetDays: 20, dueReason: "CADENCE", flagged: "SIGNAL" },
  { key: "garde-fou", offsetDays: 20, dueReason: "CADENCE", flagged: "GARDE_FOU" },
  {
    key: "signal-depublie",
    publication: "DRAFT",
    offsetDays: 20,
    dueReason: "CADENCE",
    flagged: "SIGNAL",
  },
  { key: "audience-echue", offsetDays: 0, dueReason: "AUDIENCE" },
  { key: "delibere-demain", offsetDays: 1, dueReason: "DELIBERE" },
  { key: "cadence-hier", offsetDays: -1, dueReason: "CADENCE" },
  { key: "cadence-tres-en-retard", offsetDays: -10, dueReason: "CADENCE" },
  { key: "cadence-dans-5-jours", offsetDays: 5, dueReason: "CADENCE" },
  { key: "cadence-dans-30-jours", offsetDays: 30, dueReason: "CADENCE" },
  { key: "cadence-3-jours", offsetDays: -3, dueReason: "CADENCE" },
  { key: "cadence-4-jours", offsetDays: -4, dueReason: "CADENCE" },
  {
    key: "signal-indirect",
    involvement: "INDIRECT",
    offsetDays: 20,
    dueReason: "CADENCE",
    flagged: "SIGNAL",
  },
  { key: "inactif", offsetDays: -10, dueReason: "CADENCE", active: false },
];

function expectedReason(c: Case, today: Date): NeedsHumanReason | null {
  return needsHumanReason(
    {
      active: c.active ?? true,
      nextReviewAt: new Date(today.getTime() + c.offsetDays * DAY_MS),
      dueReason: c.dueReason,
      flaggedReason: c.flagged ?? null,
      affair: {
        publicationStatus: c.publication ?? "PUBLISHED",
        involvement: c.involvement ?? "DIRECT",
      },
    },
    today
  );
}

describeIfDisposableDb("file de suivi des affaires", () => {
  const politicianIds: string[] = [];
  const suffix = crypto.randomUUID();
  const affairByKey = new Map<string, string>();
  const today = parisDay(NOW);
  let baselineCount = 0;

  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    queries = await import("../queries");
    baselineCount = await queries.countMonitoringToHandle(NOW);

    for (const c of CASES) {
      const politician = await db.politician.create({
        data: {
          slug: `test-file-${c.key}-${suffix}`,
          firstName: "Test",
          lastName: "File",
          fullName: `Test File ${c.key}`,
        },
      });
      politicianIds.push(politician.id);
      const affair = await db.affair.create({
        data: {
          politicianId: politician.id,
          slug: `test-affaire-file-${c.key}-${suffix}`,
          title: `Affaire de test ${c.key}`,
          description: "Donnée de test jetable.",
          status: "PROCES_EN_COURS" satisfies AffairStatus,
          category: "FAVORITISME",
          involvement: c.involvement ?? "DIRECT",
          publicationStatus: c.publication ?? "PUBLISHED",
        },
      });
      affairByKey.set(c.key, affair.id);
      await db.affairMonitoring.create({
        data: {
          affairId: affair.id,
          active: c.active ?? true,
          nextReviewAt: new Date(today.getTime() + c.offsetDays * DAY_MS),
          dueReason: c.dueReason,
          dateOrigin: "CADENCE",
          flaggedReason: c.flagged ?? null,
          statusAtSchedule: "PROCES_EN_COURS",
        },
      });
    }
  });

  afterAll(async () => {
    // Cascade removes affairs and monitoring rows.
    await db.politician.deleteMany({ where: { id: { in: politicianIds } } });
    await db.$disconnect();
  });

  it("porte la même raison que needsHumanReason pour chaque cas", async () => {
    const { toHandle } = await queries.getMonitoringQueue(NOW);
    const mine = new Map(
      toHandle
        .filter((r) => [...affairByKey.values()].includes(r.affairId))
        .map((r) => [r.affairId, r.reason])
    );
    for (const c of CASES) {
      const expected = expectedReason(c, today);
      const id = affairByKey.get(c.key)!;
      if (expected === null) expect(mine.has(id), c.key).toBe(false);
      else expect(mine.get(id), c.key).toBe(expected);
    }
    expect(expectedReason(CASES.find((c) => c.key === "cadence-3-jours")!, today)).toBeNull();
    expect(mine.get(affairByKey.get("cadence-4-jours")!)).toBe("CONTROLE_IMPOSSIBLE");
    expect(mine.has(affairByKey.get("signal-depublie")!)).toBe(false);
    expect(mine.has(affairByKey.get("signal-indirect")!)).toBe(false);
  });

  it("compte exactement les cas à traiter", async () => {
    const expected = CASES.filter((c) => expectedReason(c, today) !== null).length;
    const count = await queries.countMonitoringToHandle(NOW);
    // Delta against the count taken before the fixtures: an overcount fails here.
    expect(count - baselineCount).toBe(expected);
    const { toHandle, toHandleTotal } = await queries.getMonitoringQueue(NOW);
    const ids = new Set(affairByKey.values());
    expect(toHandle.filter((r) => ids.has(r.affairId))).toHaveLength(expected);
    expect(toHandleTotal).toBe(count);
    expect(toHandle).toHaveLength(Math.min(count, queries.QUEUE_LIMIT));
  });

  it("range à venir les suivis des 14 prochains jours, hors à traiter", async () => {
    const { toHandle, upcoming } = await queries.getMonitoringQueue(NOW);
    const upcomingIds = upcoming.map((r) => r.affairId);
    expect(upcomingIds).toContain(affairByKey.get("cadence-dans-5-jours"));
    expect(upcomingIds).not.toContain(affairByKey.get("cadence-dans-30-jours"));
    expect(upcomingIds).toContain(affairByKey.get("delibere-demain"));
    expect(upcomingIds).not.toContain(affairByKey.get("audience-echue"));
    const handleIds = new Set(toHandle.map((r) => r.affairId));
    expect(upcomingIds.some((id) => handleIds.has(id))).toBe(false);
  });

  it("expose le panneau d'une affaire et ses derniers contrôles", async () => {
    const id = affairByKey.get("signal")!;
    const panel = await queries.getAffairMonitoringPanel(id, NOW);
    expect(panel?.reason).toBe("SIGNAL");
    expect(panel?.checks).toEqual([]);
    expect(await queries.getAffairMonitoringPanel("inexistant")).toBeNull();
  });
});
