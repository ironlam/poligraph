import { syncMetadata } from "@/lib/sync";

/**
 * Per-dossier signatures from the last SUCCESSFUL amendment ingestion, persisted
 * so the next run can diff the ZIP against it and parse only changed dossiers.
 *
 * Stored as a dedicated SyncMetadata row (no schema migration): the
 * `Record<dossierRef, sha1>` lives in the `extra` JSON bag. A few thousand short
 * hashes is ~200 KB of JSON, acceptable for a single row.
 */
export const dossierSignatureKey = (legislature: number) => `amendments-dossier-sig:${legislature}`;

/** Read the stored signatures. Returns an empty record when none persisted yet. */
export async function loadStoredDossierSignatures(
  legislature: number
): Promise<Record<string, string>> {
  const state = await syncMetadata.get(dossierSignatureKey(legislature));
  const extra = state?.extra;
  if (!extra || typeof extra !== "object") return {};
  const out: Record<string, string> = {};
  for (const [ref, sig] of Object.entries(extra as Record<string, unknown>)) {
    if (typeof sig === "string") out[ref] = sig;
  }
  return out;
}

/** Persist the current signatures as the new baseline (call only on success). */
export async function saveStoredDossierSignatures(
  legislature: number,
  signatures: Map<string, string>
): Promise<void> {
  await syncMetadata.set(dossierSignatureKey(legislature), {
    itemCount: signatures.size,
    extra: Object.fromEntries(signatures),
  });
}
