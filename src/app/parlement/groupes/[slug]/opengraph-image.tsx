import { ImageResponse } from "next/og";
import { formatSeatShare } from "@/components/groupes/GroupCard";
import { CHAMBER_LABELS } from "@/config/labels";
import { getGovernmentProjectPositionsForGroup } from "@/lib/data/government-project-positions";
import { getGroupeDetail, getGroupHemicyclePlacement } from "@/lib/data/groupes";
import { asOfLabel, groupNameSize, positionSegments } from "@/lib/groupes/og-card";
import { OG_SIZE } from "@/lib/og-utils";
import { loadOgFonts, OG_FONT_DISPLAY } from "@/lib/og/fonts";
import { OG_INK, OgBrandFrame, OgChip, OgFooter, OgWordmark } from "@/lib/og/frame";
import { OgGroupMonogram, OgPositionBar, OgPositionLegend } from "@/lib/og/group-parts";
import { hemicycleDots, legislatureLabel, type HemicyclePlacement } from "@/lib/share-card";

/**
 * Preview card of a group's page: who it is, how many seats it holds and where they sit, and, at
 * the Assemblée, its positions on the government's bills.
 *
 * The lit seats are white, never the group's colour: a dark colour (RN, HOR) would vanish on the
 * navy and a bright one (EPR) would shout, so every group gets the same contrast. A group with
 * no declared place on the benches (the non-inscrits) gets no hemicycle rather than a seat
 * invented at one end, as on the page.
 */

export const alt = "Groupe parlementaire sur Poligraph";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 86400;

const HEMICYCLE_WIDTH = 400;
/** Same dot-to-radius ratio as the downloadable share card, so the rows never touch. */
const DOT_RADIUS = 6;
const SEAT_ON = "#ffffff";
const SEAT_OFF = "#2c4d7a";

function Hemicycle({ placement }: { placement: HemicyclePlacement }) {
  const radius = HEMICYCLE_WIDTH / 2 - DOT_RADIUS;
  const height = radius + DOT_RADIUS * 2;
  return (
    <svg width={HEMICYCLE_WIDTH} height={height} viewBox={`0 0 ${HEMICYCLE_WIDTH} ${height}`}>
      {hemicycleDots(placement).map((dot, index) => {
        let fill = SEAT_OFF;
        if (dot.on) fill = SEAT_ON;
        return (
          <circle
            key={index}
            cx={HEMICYCLE_WIDTH / 2 + dot.x * radius}
            cy={radius + DOT_RADIUS - dot.y * radius}
            r={DOT_RADIUS}
            fill={fill}
          />
        );
      })}
    </svg>
  );
}

function fallbackCard() {
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
        Groupe non trouvé
      </div>
    </OgBrandFrame>
  );
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [group, fonts] = await Promise.all([getGroupeDetail(slug), loadOgFonts()]);
  if (!group) return new ImageResponse(fallbackCard(), { ...OG_SIZE, fonts });

  const isAssembly = group.chamber === "AN";
  // Same scope as the page's section: the Assemblée only, the non-inscrits excluded.
  let projectsRequest: ReturnType<typeof getGovernmentProjectPositionsForGroup> =
    Promise.resolve(null);
  if (isAssembly && group.code !== "NI") {
    projectsRequest = getGovernmentProjectPositionsForGroup(group.code);
  }
  const [placement, governmentProjects] = await Promise.all([
    getGroupHemicyclePlacement(group.id, group.chamber),
    projectsRequest,
  ]);

  const chamberLabel = CHAMBER_LABELS[group.chamber];
  let seatNoun = "sénateur";
  if (isAssembly) seatNoun = "député";
  if (group.seatCount > 1) seatNoun = `${seatNoun}s`;

  let seatShare: string | null = null;
  if (placement && placement.total > 0) {
    seatShare = `soit ${formatSeatShare(placement.seats, placement.total)} des ${placement.total} sièges occupés`;
  }

  let positions: ReturnType<typeof positionSegments> | null = null;
  if (governmentProjects) positions = positionSegments(governmentProjects.summary.counts);
  const showPositions = positions !== null && positions.total > 0;

  // Without the positions block, the identity row is centred instead of left hanging at the top.
  let rowTop: number | string = 34;
  let rowBottom: number | string = 0;
  if (!showPositions) {
    rowTop = "auto";
    rowBottom = "auto";
  }

  const footerParts: string[] = [];
  if (group.legislature !== null) footerParts.push(legislatureLabel(group.legislature));
  let source = `Source : ${chamberLabel}`;
  const asOf = asOfLabel(governmentProjects?.summary.updatedAt ?? null);
  if (showPositions && asOf) source = `${source}, ${asOf}`;
  footerParts.push(source);

  return new ImageResponse(
    <OgBrandFrame>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "34px 64px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <OgWordmark />
          <OgChip label={`Groupe parlementaire · ${chamberLabel}`} />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 40,
            marginTop: rowTop,
            marginBottom: rowBottom,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 22, flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
              <OgGroupMonogram code={group.code} color={group.color} size={92} />
              <span
                style={{
                  fontFamily: OG_FONT_DISPLAY,
                  fontWeight: 800,
                  fontSize: groupNameSize(group.name) - 8,
                  lineHeight: 1.05,
                  letterSpacing: -1,
                }}
              >
                {group.name}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
              <span
                style={{
                  fontFamily: OG_FONT_DISPLAY,
                  fontWeight: 800,
                  fontSize: 76,
                  lineHeight: 1,
                  letterSpacing: -2,
                }}
              >
                {`${group.seatCount}`}
              </span>
              <span style={{ fontSize: 28, color: OG_INK.body }}>{seatNoun}</span>
            </div>
            {seatShare && <span style={{ fontSize: 23, color: OG_INK.muted }}>{seatShare}</span>}
          </div>

          {placement && placement.total > 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                flexShrink: 0,
              }}
            >
              <Hemicycle placement={placement} />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  width: HEMICYCLE_WIDTH,
                  fontSize: 18,
                  color: OG_INK.muted,
                }}
              >
                <span>Gauche</span>
                <span>Droite</span>
              </div>
            </div>
          )}
        </div>

        {showPositions && positions && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: "auto" }}>
            <div
              style={{
                display: "flex",
                fontSize: 19,
                fontWeight: 700,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: OG_INK.muted,
              }}
            >
              Votes sur les projets de loi du gouvernement
            </div>
            <OgPositionBar segments={positions.segments} height={16} />
            <OgPositionLegend segments={positions.segments} withCounts={false} />
          </div>
        )}
      </div>

      <OgFooter source={footerParts.join(" · ")} />
    </OgBrandFrame>,
    { ...OG_SIZE, fonts }
  );
}
