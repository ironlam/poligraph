import { NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { loadBlockedAffairs } from "@/lib/affairs/blocked-affairs";

/**
 * Separate from /stats on purpose: this one calls the publish guard once per
 * candidate affair, so it costs about a second and a half. The counters render
 * immediately and this list fills in behind them.
 */
export const GET = withAdminAuth(async () => {
  const affairs = await loadBlockedAffairs();
  // Distinct, not summed: one orphan decision can hold up two affairs through the
  // guard's fallback path, and counting it twice would overstate the work.
  const distinct = new Set(affairs.flatMap((a) => a.decisionIds));
  return NextResponse.json({ affairs, decisionCount: distinct.size });
});
