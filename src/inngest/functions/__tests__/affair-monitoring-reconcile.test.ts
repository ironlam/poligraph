import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  captured: [] as { config: Record<string, unknown>; trigger: unknown; handler: unknown }[],
  reconcileAllAffairMonitoring: vi.fn(),
}));

vi.mock("../../client", () => ({
  inngest: {
    createFunction: (config: Record<string, unknown>, trigger: unknown, handler: unknown) => {
      h.captured.push({ config, trigger, handler });
      return { handler };
    },
  },
}));
vi.mock("@/lib/affairs/monitoring/reconcile", () => ({
  reconcileAllAffairMonitoring: h.reconcileAllAffairMonitoring,
}));

import "../affair-monitoring-reconcile";

const fn = () => h.captured[0]!;
const step = { run: async (_name: string, cb: () => Promise<unknown>) => cb() };

describe("balayage quotidien du suivi des affaires", () => {
  beforeEach(() => h.reconcileAllAffairMonitoring.mockReset());

  it("déclare l'identifiant, le cron, la concurrence et les reprises", () => {
    expect(fn().config).toMatchObject({
      id: "affair-monitoring/reconcile",
      retries: 1,
      concurrency: { limit: 1, key: '"affair-monitoring"' },
    });
    expect(fn().trigger).toEqual({ cron: "TZ=Europe/Paris 30 5 * * *" });
  });

  it("relaie les compteurs, échecs compris, sans lever d'erreur", async () => {
    const counts = { created: 2, updated: 3, deactivated: 1, failed: 4 };
    h.reconcileAllAffairMonitoring.mockResolvedValue(counts);
    const handler = fn().handler as (ctx: { step: unknown }) => Promise<unknown>;
    await expect(handler({ step })).resolves.toEqual(counts);
  });

  it("figure dans le registre des fonctions", () => {
    const src = readFileSync(join(process.cwd(), "src/inngest/index.ts"), "utf8");
    expect(src).toContain('from "./functions/affair-monitoring-reconcile"');
    const list = src.slice(src.indexOf("const groupedFunctions"), src.indexOf("];"));
    expect(list).toContain("affairMonitoringReconcile,");
  });
});
