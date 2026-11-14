/**
 * Pieces shared by the Open Graph cards of a parliamentary group: its monogram, and the pour /
 * abstention / contre bar with its legend. Drawn on the navy frame of `./frame`.
 */
import { NEUTRAL_GROUP_COLOR } from "@/config/parliamentaryGroups";
import { getAccessibleTextColor } from "@/lib/contrast";
import { monogramSize, type PositionSegment } from "@/lib/groupes/og-card";
import { OG_FONT_DISPLAY } from "@/lib/og/fonts";
import { OG_INK, OG_VOTE_FILL } from "@/lib/og/frame";
import type { GovernmentProjectPosition } from "@/lib/scrutins/government-project-positions";

export const POSITION_FILL: Record<GovernmentProjectPosition, string> = {
  POUR: OG_VOTE_FILL.pour,
  ABSTENTION: OG_VOTE_FILL.abstention,
  CONTRE: OG_VOTE_FILL.contre,
};

/** A non-zero position stays visible even when its share is a sliver. */
const MIN_SEGMENT_PX = 6;
/** Below this share a percent printed inside the bar would not fit; the legend carries it. */
const MIN_INSIDE_LABEL_SHARE = 14;

/**
 * The group's code on its own colour, as on the site. The white ring keeps a dark group colour
 * (RN, HOR) distinct from the navy ground, the same ring for every group.
 */
export function OgGroupMonogram({
  code,
  color,
  size,
}: {
  code: string;
  color: string | null;
  size: number;
}) {
  const background = color ?? NEUTRAL_GROUP_COLOR;
  const scale = size / 92;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: size,
        height: size,
        padding: "0 12px",
        flexShrink: 0,
        whiteSpace: "nowrap",
        borderRadius: Math.round(size * 0.2),
        border: `${Math.max(3, Math.round(3 * scale))}px solid #ffffff`,
        background,
        color: getAccessibleTextColor(background),
        fontFamily: OG_FONT_DISPLAY,
        fontWeight: 800,
        fontSize: Math.round(monogramSize(code) * scale),
        letterSpacing: -0.5,
      }}
    >
      {code}
    </div>
  );
}

export function OgPositionBar({
  segments,
  height,
  insideLabels = false,
}: {
  segments: PositionSegment[];
  height: number;
  insideLabels?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height,
        gap: 3,
        borderRadius: Math.min(12, Math.round(height / 4)),
        overflow: "hidden",
        background: OG_INK.track,
      }}
    >
      {segments
        .filter((segment) => segment.count > 0)
        .map((segment) => {
          let label = "";
          if (insideLabels && segment.share >= MIN_INSIDE_LABEL_SHARE) {
            label = `${segment.percent}\u00a0%`;
          }
          return (
            <div
              key={segment.key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexGrow: segment.count,
                flexShrink: 1,
                flexBasis: 0,
                minWidth: MIN_SEGMENT_PX,
                background: POSITION_FILL[segment.key],
                color: OG_INK.onFill,
                fontFamily: OG_FONT_DISPLAY,
                fontWeight: 800,
                fontSize: Math.round(height * 0.5),
              }}
            >
              {label}
            </div>
          );
        })}
    </div>
  );
}

/** Every position named in words beside its swatch: the colour never speaks alone. */
export function OgPositionLegend({
  segments,
  withCounts = true,
}: {
  segments: PositionSegment[];
  withCounts?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 40 }}>
      {segments.map((segment) => (
        <div key={segment.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              display: "flex",
              width: 18,
              height: 18,
              borderRadius: 4,
              background: POSITION_FILL[segment.key],
            }}
          />
          <span style={{ fontSize: 24, color: OG_INK.body }}>{segment.label}</span>
          <span
            style={{
              fontFamily: OG_FONT_DISPLAY,
              fontWeight: 800,
              fontSize: 28,
              color: OG_INK.title,
            }}
          >
            {`${segment.percent}\u00a0%`}
          </span>
          {withCounts && (
            <span style={{ fontSize: 20, color: OG_INK.muted }}>{`(${segment.count})`}</span>
          )}
        </div>
      ))}
    </div>
  );
}
