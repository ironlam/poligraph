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
  { key: "cadence-aujourdhui", offsetDays: 0, dueReason: "CADENCE" },
  { key: "cadence-demain", offsetDays: 1, dueReason: "CADENCE" },
  { key: "manuel-aujourdhui", offsetDays: 0, dueReason: "MANUEL" },
  { key: "delibere-aujourdhui", offsetDays: 0, dueReason: "DELIBERE" },
  {
    key: "cadence-aujourdhui-brouillon",
    publication: "DRAFT",
    offsetDays: 0,
    dueReason: "CADENCE",
  },
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
  let importRunId = "";
  const proposalIdByKey = new Map<string, string>();

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

    // Two pending proposals and an approved one, all on the "signal" affair.
    importRunId = (
      await db.importRun.create({
        data: { importer: "test-monitoring-queue", status: "COMPLETED", finishedAt: NOW },
      })
    ).id;
    const proposals: { key: string; status: "PENDING" | "APPROVED"; createdAt: string }[] = [
      { key: "ancienne", status: "PENDING", createdAt: "2026-10-01T08:00:00Z" },
      { key: "recente", status: "PENDING", createdAt: "2026-10-05T08:00:00Z" },
      { key: "approuvee", status: "APPROVED", createdAt: "2026-10-06T08:00:00Z" },
    ];
    for (const p of proposals) {
      const created = await db.affairUpdateProposal.create({
        data: {
          affairId: affairByKey.get("signal")!,
          affairSnapshot: { title: "Affaire de test signal" },
          importer: "test-monitoring-queue",
          importRunId,
          proposedPatch: { status: "APPEL_EN_COURS" },
          observedValues: { status: "PROCES_EN_COURS" },
          source: "MANUAL",
          confidence: 50,
          riskLevel: "HIGH",
          rationale: "Donnée de test jetable.",
          payloadHash: `test-monitoring-queue-${p.key}-${suffix}`,
          status: p.status,
          createdAt: new Date(p.createdAt),
        },
      });
      proposalIdByKey.set(p.key, created.id);
    }
  });

  afterAll(async () => {
    await db.affairUpdateProposal.deleteMany({ where: { importRunId } });
    await db.importRun.deleteMany({ where: { id: importRunId } });
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
    expect(mine.get(affairByKey.get("cadence-aujourdhui")!)).toBe("ECHUE");
    expect(mine.get(affairByKey.get("cadence-hier")!)).toBe("ECHUE");
    expect(mine.has(affairByKey.get("cadence-demain")!)).toBe(false);
    expect(mine.get(affairByKey.get("manuel-aujourdhui")!)).toBe("ECHUE");
    expect(mine.get(affairByKey.get("delibere-aujourdhui")!)).toBe("DATE_ATTENDUE");
    expect(mine.has(affairByKey.get("cadence-aujourdhui-brouillon")!)).toBe(false);
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
    expect(upcomingIds).toContain(affairByKey.get("cadence-demain"));
    expect(upcomingIds).not.toContain(affairByKey.get("cadence-aujourdhui"));
    expect(upcomingIds).not.toContain(affairByKey.get("audience-echue"));
    const handleIds = new Set(toHandle.map((r) => r.affairId));
    expect(upcomingIds.some((id) => handleIds.has(id))).toBe(false);
  });

  it("rattache à la ligne la proposition en attente la plus récente", async () => {
    const { toHandle } = await queries.getMonitoringQueue(NOW);
    const byId = new Map(toHandle.map((r) => [r.affairId, r]));
    expect(byId.get(affairByKey.get("signal")!)?.pendingProposalId).toBe(
      proposalIdByKey.get("recente")
    );
    const withoutProposal = byId.get(affairByKey.get("garde-fou")!);
    expect(withoutProposal).toBeDefined();
    expect(withoutProposal?.pendingProposalId).toBeNull();
  });

  it("expose le panneau d'une affaire et ses derniers contrôles", async () => {
    const id = affairByKey.get("signal")!;
    const panel = await queries.getAffairMonitoringPanel(id, NOW);
    expect(panel?.reason).toBe("SIGNAL");
    expect(panel?.checks).toEqual([]);
    expect(await queries.getAffairMonitoringPanel("inexistant")).toBeNull();
  });
});
