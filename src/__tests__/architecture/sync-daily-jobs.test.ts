import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

// The daily workflow runs one job per step group of scripts/sync-daily.ts, so
// that a failing group no longer fails the others (#1355). These guards keep
// the two files in step: a group without a job would silently stop running.

interface Job {
  needs?: string[];
  if?: string;
  "timeout-minutes"?: number;
  steps: { run?: string }[];
}

const script = readFileSync("scripts/sync-daily.ts", "utf8");
const workflow = load(readFileSync(".github/workflows/sync-daily.yml", "utf8")) as {
  concurrency?: { group: string; "cancel-in-progress": boolean };
  jobs: Record<string, Job>;
};

const declaredGroups = [
  ...script
    .slice(script.indexOf("const SYNC_GROUPS = ["), script.indexOf("] as const;"))
    .matchAll(/"([a-z-]+)"/g),
].map((match) => match[1]!);
const stepGroups = [...script.matchAll(/^\s+group: "([a-z-]+)",$/gm)].map((match) => match[1]!);

const syncJobs = Object.entries(workflow.jobs).filter(([id]) => id !== "notify");

describe("Daily : un job par groupe d'étapes", () => {
  it("lit bien les groupes et les étapes du script", () => {
    expect(declaredGroups).toHaveLength(7);
    expect(stepGroups.length).toBeGreaterThanOrEqual(22);
  });

  it("chaque groupe déclaré porte au moins une étape", () => {
    expect([...new Set(stepGroups)].sort()).toEqual([...declaredGroups].sort());
  });

  it("chaque groupe a son job, qui ne lance que lui", () => {
    expect(syncJobs.map(([id]) => id).sort()).toEqual([...declaredGroups].sort());
    for (const [id, job] of syncJobs) {
      const runs = job.steps.map((step) => step.run).filter(Boolean);
      expect(runs, id).toEqual([`npm run sync:daily -- --group=${id}`]);
      expect(job["timeout-minutes"], `${id} n'a pas de délai`).toBeGreaterThan(0);
    }
  });

  it("un job qui dépend d'un autre tourne même si celui-ci a échoué", () => {
    for (const [id, job] of syncJobs) {
      if (!job.needs?.length) continue;
      expect(job.if, `${id} serait sauté après un échec en amont`).toMatch(
        /^\$\{\{ (!cancelled\(\)|always\(\)) \}\}$/
      );
    }
  });

  it("l'analyse de presse attend l'import", () => {
    expect(workflow.jobs["press-analysis"]!.needs).toContain("press-import");
  });

  it("la purge passe en dernier, quoi qu'il arrive", () => {
    const purge = workflow.jobs.purge!;
    expect(purge.if).toBe("${{ always() }}");
    expect([...purge.needs!].sort()).toEqual(declaredGroups.filter((g) => g !== "purge").sort());
  });

  it("l'alerte couvre tous les jobs", () => {
    expect([...workflow.jobs.notify!.needs!].sort()).toEqual([...declaredGroups].sort());
  });

  it("deux passages ne tournent pas en même temps", () => {
    expect(workflow.concurrency).toEqual({ group: "sync-daily", "cancel-in-progress": false });
  });
});
