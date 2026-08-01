import { NextResponse } from "next/server";
import { getAffairNeighborsList } from "@/lib/data/affairs";
import { pickNeighbors } from "@/lib/affairs/neighbors";
import { CERTAINTY_LABELS, type CertaintyLevel } from "@/config/certainty";
import {
  AFFAIR_SUPER_CATEGORY_LABELS,
  AFFAIR_STATUS_LABELS,
  AFFAIR_CATEGORY_LABELS,
  type AffairSuperCategory,
} from "@/config/labels";
import type { AffairStatus, Involvement } from "@/types";

/**
 * Prev/next resolution for the affair detail page, within the reader's listing
 * perimeter. Client-fetched so the detail page stays static (ISR): the filters
 * ride in the query string exactly as /affaires serialised them into `?retour=`.
 * Read-only, published-only. Params are whitelisted so a crafted value can only
 * ever narrow the published set, never widen it.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const slug = searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "slug requis" }, { status: 400 });
  }

  const mode = searchParams.get("mode") === "victime" ? "victime" : "mise-en-cause";
  const involvements: Involvement[] =
    mode === "victime" ? ["VICTIM", "PLAINTIFF"] : ["DIRECT", "INDIRECT", "MENTIONED_ONLY"];

  // Only accept values from the known vocabularies; anything else is ignored so
  // it can never reach getStatusesForCertainty / getCategoriesForSuper as junk.
  const certaintyRaw = searchParams.get("certainty");
  const certainty =
    certaintyRaw && certaintyRaw in CERTAINTY_LABELS ? (certaintyRaw as CertaintyLevel) : undefined;

  const supercatRaw = searchParams.get("supercat");
  const superCategory =
    supercatRaw && supercatRaw in AFFAIR_SUPER_CATEGORY_LABELS
      ? (supercatRaw as AffairSuperCategory)
      : undefined;

  const statusRaw = searchParams.get("status");
  const status =
    statusRaw && statusRaw in AFFAIR_STATUS_LABELS ? (statusRaw as AffairStatus) : undefined;

  const categoryRaw = searchParams.get("category");
  const category = categoryRaw && categoryRaw in AFFAIR_CATEGORY_LABELS ? categoryRaw : undefined;

  const ordered = await getAffairNeighborsList({
    search: searchParams.get("search") || undefined,
    status,
    superCategory,
    category,
    involvements,
    partySlug: searchParams.get("parti") || undefined,
    certainty,
    sort: searchParams.get("sort") || undefined,
  });

  const neighbors = pickNeighbors(ordered, slug);

  return NextResponse.json(neighbors, {
    // Small CDN cache: the perimeter changes at most daily (synced data).
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400" },
  });
}
