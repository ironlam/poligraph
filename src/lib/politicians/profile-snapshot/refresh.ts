import { buildPoliticianProfileDocument } from "./build";
import { writeProfileSnapshot } from "./store";

export type RefreshOutcome = {
  politicianId: string;
  status: "unchanged" | "updated" | "skipped-stale" | "not-public";
  durationMs: number;
  reason: string;
};

// Same cacheLife profile as `src/lib/cache.ts`. Imported lazily so tsx scripts and unit tests
// can load this module outside a Next runtime.
async function revalidateProfileTag(tag: string): Promise<void> {
  const { revalidateTag } = await import("next/cache");
  revalidateTag(tag, "minutes");
}

/**
 * Rebuilds a politician's profile document and stores it unless a later build already did.
 * Invalidates `politician:<slug>` only when the stored content actually changed, with the slug
 * read from the fresh build so a renamed politician invalidates the current URL.
 */
export async function refreshPoliticianProfile(
  politicianId: string,
  reason: string,
  deps: { revalidate?: (tag: string) => void | Promise<void> } = {}
): Promise<RefreshOutcome> {
  const startedAt = new Date();
  const revalidate = deps.revalidate ?? revalidateProfileTag;

  let status: RefreshOutcome["status"];
  const document = await buildPoliticianProfileDocument({ id: politicianId });
  if (!document) {
    status = "not-public";
  } else {
    const { written, changed } = await writeProfileSnapshot({ politicianId, document, startedAt });
    status = !written ? "skipped-stale" : changed ? "updated" : "unchanged";
    if (status === "updated") await revalidate(`politician:${document.identity.slug}`);
  }

  const outcome: RefreshOutcome = {
    politicianId,
    status,
    durationMs: Date.now() - startedAt.getTime(),
    reason,
  };
  console.info(JSON.stringify({ event: "[profile-snapshot] refresh", ...outcome }));
  return outcome;
}
