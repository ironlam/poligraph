import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildIcsCalendar, type IcsEvent } from "@/lib/ics";
import { isElectionOver } from "@/lib/elections/status";
import { SITE_URL } from "@/config/site";
import { withPublicRoute } from "@/lib/api/with-public-route";

export const GET = withPublicRoute(async () => {
  const rows = await db.election.findMany({
    where: { round1Date: { not: null } },
    orderBy: { round1Date: "asc" },
    select: {
      slug: true,
      title: true,
      description: true,
      round1Date: true,
      round2Date: true,
      dateConfirmed: true,
      scope: true,
      status: true,
    },
  });

  // The stored status lags behind reality, so filter on the resolved phase:
  // a SQL `status != COMPLETED` still exports scrutins held months ago.
  const now = new Date();
  const elections = rows.filter((e) => !isElectionOver(e, now));

  const events: IcsEvent[] = [];

  for (const election of elections) {
    if (!election.round1Date) continue;

    const status = election.dateConfirmed ? "CONFIRMED" : "TENTATIVE";
    const url = `${SITE_URL}/elections/${election.slug}`;
    const tentativeNote = election.dateConfirmed ? "" : " (date provisoire)";

    events.push({
      uid: `election-${election.slug}-round1@poligraph.fr`,
      summary: `${election.title} — Tour 1${tentativeNote}`,
      description: election.description ? `${election.description}\n\n${url}` : url,
      start: election.round1Date,
      url,
      status,
    });

    if (election.round2Date) {
      events.push({
        uid: `election-${election.slug}-round2@poligraph.fr`,
        summary: `${election.title} — Tour 2${tentativeNote}`,
        description: election.description ? `${election.description}\n\n${url}` : url,
        start: election.round2Date,
        url,
        status,
      });
    }
  }

  const ics = buildIcsCalendar(events, "Élections France");

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="elections-france.ics"',
      "Cache-Control": "public, max-age=3600",
    },
  });
});
