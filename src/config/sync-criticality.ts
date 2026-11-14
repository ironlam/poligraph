// src/config/sync-criticality.ts

export const CRITICAL_SCRIPTS = [
  "sync-assemblee",
  "sync-senat",
  "sync-gouvernement",
  "sync-scrutins-an",
  "sync-press-analysis",
] as const;

export function isCriticalScript(script: string): boolean {
  return (CRITICAL_SCRIPTS as readonly string[]).includes(script);
}
