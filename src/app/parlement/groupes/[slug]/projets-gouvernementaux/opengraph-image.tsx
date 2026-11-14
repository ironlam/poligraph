import { ImageResponse } from "next/og";
import { getGovernmentProjectPositionsForGroup } from "@/lib/data/government-project-positions";
import { getGroupeDetail } from "@/lib/data/groupes";
import {
  asOfLabel,
  groupNameSize,
  leadingSegment,
  positionSegments,
  scrutinCountLabel,
} from "@/lib/groupes/og-card";
import { OG_SIZE } from "@/lib/og-utils";
import { loadOgFonts, OG_FONT_DISPLAY } from "@/lib/og/fonts";
import { OG_AN_CHIP, OG_INK, OgBrandFrame, OgChip, OgFooter, OgWordmark } from "@/lib/og/frame";
import {
  OgGroupMonogram,
  OgPositionBar,
  OgPositionLegend,
  POSITION_FILL,
} from "@/lib/og/group-parts";
import { legislatureLabel } from "@/lib/share-card";

/**
 * Preview card of a group's positions on the government's bills: what sets this page apart from
 * the group's own page, said in the image a feed shows.
 *
 * The figure in large type is the group's most frequent position, by one rule for every group,
 * and the bar under it keeps the other two in view. No word qualifies the group ("soutien",
 * "opposition"): the card prints counts and shares, as the page does. The counts change with
 * every new vote while platforms keep a card for as long as they like, so the card says when
 * they were read.
 */

export const alt = "Positions d'un groupe parlementaire sur les projets de loi du gouvernement";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 86400;

function fallbackCard(message: string) {
  return (
    <OgBrandFrame>
      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          fontSize: 32,
          color: OG_INK.muted,
        }}
      >
        {message}
      </div>
    </OgBrandFrame>
  );
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [group, fonts] = await Promise.all([getGroupeDetail(slug), loadOgFonts()]);

  // Same predicate as the page, so the card never describes a page that 404s.
  if (!group || group.chamber !== "AN" || group.code === "NI") {
    return new ImageResponse(fallbackCard("Groupe non trouvé"), { ...OG_SIZE, fonts });
  }
  const data = await getGovernmentProjectPositionsForGroup(group.code);
  if (!data) {
    return new ImageResponse(fallbackCard("Groupe non trouvé"), { ...OG_SIZE, fonts });
  }

  const { total, segments } = positionSegments(data.summary.counts);
  const lead = leadingSegment(segments);
  let seatsLine = `${group.seatCount} député`;
  if (group.seatCount > 1) seatsLine = `${seatsLine}s`;

  const chipParts = ["Assemblée nationale"];
  if (group.legislature !== null) chipParts.push(legislatureLabel(group.legislature));
  const sourceParts = [`${scrutinCountLabel(total)} sur l'ensemble d'un projet de loi`];
  const asOf = asOfLabel(data.summary.updatedAt);
  let source = "Assemblée nationale";
  if (asOf) source = `${source}, ${asOf}`;
  sourceParts.push(source);

  return new ImageResponse(
    <OgBrandFrame>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "34px 64px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <OgWordmark />
          <OgChip label={chipParts.join(" · ")} color={OG_AN_CHIP} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", margin: "auto 0" }}>
          <div
            style={{
              display: "flex",
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: 3,
              textTransform: "uppercase",
              color: OG_INK.muted,
            }}
          >
            Votes sur les projets de loi du gouvernement
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 32,
              marginTop: 20,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 24, flex: 1, minWidth: 0 }}>
              <OgGroupMonogram code={group.code} color={group.color} size={96} />
              <div
                style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}
              >
                <span
                  style={{
                    fontFamily: OG_FONT_DISPLAY,
                    fontWeight: 800,
                    fontSize: groupNameSize(group.name),
                    lineHeight: 1.05,
                    letterSpacing: -1,
                  }}
                >
                  {group.name}
                </span>
                <span style={{ fontSize: 24, color: OG_INK.muted }}>
                  {`${seatsLine} · position majoritaire du groupe`}
                </span>
              </div>
            </div>

            {lead && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: 10,
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    fontFamily: OG_FONT_DISPLAY,
                    fontWeight: 800,
                    fontSize: 112,
                    lineHeight: 0.95,
                    letterSpacing: -4,
                  }}
                >
                  {`${lead.percent} %`}
                </span>
                <span
                  style={{
                    display: "flex",
                    padding: "6px 18px",
                    borderRadius: 999,
                    background: POSITION_FILL[lead.key],
                    color: OG_INK.onFill,
                    fontFamily: OG_FONT_DISPLAY,
                    fontWeight: 800,
                    fontSize: 26,
                  }}
                >
                  {lead.label}
                </span>
              </div>
            )}
          </div>
        </div>

        {total > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <OgPositionBar segments={segments} height={40} />
            <OgPositionLegend segments={segments} />
          </div>
        )}
        {total === 0 && (
          <div style={{ display: "flex", fontSize: 26, color: OG_INK.body }}>
            Aucune position calculable pour l&apos;instant.
          </div>
        )}
      </div>

      <OgFooter source={sourceParts.join(" · ")} />
    </OgBrandFrame>,
    { ...OG_SIZE, fonts }
  );
}
