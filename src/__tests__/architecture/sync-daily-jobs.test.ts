import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The daily workflow runs one job per step group of scripts/sync-daily.ts, so
// that a failing group no longer fails the others (#1355). These guards keep
// the two files in step: a group without a job would silently stop running.

interface Job {
  needs: string[];
  if?: string;
  timeoutMinutes?: number;
  runs: string[];
}

const script = readFileSync("scripts/sync-daily.ts", "utf8");
const workflowSource = readFileSync(".github/workflows/sync-daily.yml", "utf8");

// Read by indentation rather than with a YAML parser: none is a direct dependency.
function readJobs(source: string): Record<string, Job> {
  const jobs: Record<string, Job> = {};
  const blocks = source.slice(source.indexOf("\njobs:\n")).split(/\n(?= {2}[a-z-]+:\n)/);
  for (const block of blocks.slice(1)) {
    const id = block.match(/^ {2}([a-z-]+):/)![1]!;
    const timeout = block.match(/^ {4}timeout-minutes: (\d+)$/m)?.[1];
    jobs[id] = {
      needs: block.match(/^ {4}needs: \[(.*)\]$/m)?.[1]?.split(", ") ?? [],
      if: block.match(/^ {4}if: (.*)$/m)?.[1],
      timeoutMinutes: timeout ? Number(timeout) : undefined,
      runs: [...block.matchAll(/^ {8}run: (.+)$/gm)].map((match) => match[1]!),
    };
  }
  return jobs;
}

const jobs = readJobs(workflowSource);

const declaredGroups = [
  ...script
    .slice(script.indexOf("const SYNC_GROUPS = ["), script.indexOf("] as const;"))
    .matchAll(/"([a-z-]+)"/g),
].map((match) => match[1]!);
const stepGroups = [...script.matchAll(/^\s+group: "([a-z-]+)"(?: as const)?,$/gm)].map(
  (match) => match[1]!
);

const syncJobs = Object.entries(jobs).filter(([id]) => id !== "notify");

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
      expect(job.runs, id).toEqual([`npm run sync:daily -- --group=${id}`]);
      expect(job.timeoutMinutes, `${id} n'a pas de délai`).toBeGreaterThan(0);
    }
  });

  it("un job qui dépend d'un autre tourne même si celui-ci a échoué", () => {
    for (const [id, job] of syncJobs) {
      if (job.needs.length === 0) continue;
      expect(job.if, `${id} serait sauté après un échec en amont`).toMatch(
        /^\$\{\{ (!cancelled\(\)|always\(\)) \}\}$/
      );
    }
  });

  it("l'analyse de presse attend l'import", () => {
    expect(jobs["press-analysis"]!.needs).toContain("press-import");
  });

  it("la purge passe en dernier, quoi qu'il arrive", () => {
    const purge = jobs.purge!;
    expect(purge.if).toBe("${{ always() }}");
    expect([...purge.needs].sort()).toEqual(declaredGroups.filter((g) => g !== "purge").sort());
  });

  it("l'alerte couvre tous les jobs", () => {
    expect([...jobs.notify!.needs].sort()).toEqual([...declaredGroups].sort());
  });

  it("deux passages ne tournent pas en même temps", () => {
    expect(workflowSource).toContain(
      "\nconcurrency:\n  group: sync-daily\n  cancel-in-progress: false\n"
    );
  });
});
