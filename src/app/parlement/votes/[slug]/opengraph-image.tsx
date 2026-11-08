import { ImageResponse } from "next/og";
import type { Chamber, Prisma, VotingResult } from "@/generated/prisma";
import { db } from "@/lib/db";
import { OG_SIZE, OWL_DATA_URI } from "@/lib/og-utils";
import { loadOgFonts, OG_FONT_DISPLAY, OG_FONT_TEXT } from "@/lib/og/fonts";
import { toPublicTitleView } from "@/lib/votes/to-public-title-view";
import {
  scrutinOgHeadline,
  scrutinOgHeadlineSize,
  scrutinOgSegments,
  type VoteSegmentKey,
} from "@/lib/votes/og-card";
import { extractScrutinNumber } from "@/lib/votes/scrutin-number";
import { BRAND_NAVY, BRAND_PAGE, BRAND_RED } from "@/config/brand";
import { CHAMBER_LABELS, THEME_CATEGORY_LABELS } from "@/config/labels";
import { formatDate } from "@/lib/utils";

export const alt = "Vote parlementaire sur Poligraph";
export const size = OG_SIZE;
export const contentType = "image/png";

// Dark-theme values of the Poligraph design-system tokens, read on the navy ground. Vote fills
// are the desaturated `vote-*` tokens: a vivid green and red would cast one side as the good one.
const INK = {
  title: "#ffffff",
  body: "#e6ebf2",
  muted: "#b8c4d6",
  rule: "#23416b",
  track: "#1c3a63",
  chipBorder: "#4a6286",
  chipText: "#c9d3e1",
  onFill: "#1a1a2e",
};

const VOTE_FILL: Record<VoteSegmentKey, string> = {
  pour: "#7ab892",
  contre: "#c88a8a",
  abstention: "#92959c",
};

const CHAMBER_CHIP: Record<Chamber, { border: string; text: string }> = {
  AN: { border: "#60a5fa", text: "#9cc6fb" },
  SENAT: { border: "#f472b6", text: "#f9a8d4" },
};

const RESULT_BADGE: Record<VotingResult, { label: string; fill: string; icon: "check" | "x" }> = {
  ADOPTED: { label: "Adopté", fill: VOTE_FILL.pour, icon: "check" },
  REJECTED: { label: "Rejeté", fill: VOTE_FILL.contre, icon: "x" },
};

/** A non-zero position stays visible even when its share rounds to a sliver. */
const MIN_SEGMENT_PX = 4;

const scrutinOgSelect = {
  title: true,
  externalId: true,
  votingDate: true,
  result: true,
  chamber: true,
  theme: true,
  sourceUrl: true,
  votesFor: true,
  votesAgainst: true,
  votesAbstain: true,
  policyTitle: {
    select: {
      status: true,
      policyTitle: true,
      policySubtitle: true,
      officialSourceUrl: true,
      proceduralLabel: true,
    },
  },
} satisfies Prisma.ScrutinSelect;

async function findScrutin(slugOrId: string) {
  const bySlug = await db.scrutin.findUnique({
    where: { slug: slugOrId },
    select: scrutinOgSelect,
  });
  if (bySlug) return bySlug;
  return db.scrutin.findUnique({ where: { id: slugOrId }, select: scrutinOgSelect });
}

function ChamberIcon({ color }: { color: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="3" x2="21" y1="22" y2="22" />
      <line x1="6" x2="6" y1="18" y2="11" />
      <line x1="10" x2="10" y1="18" y2="11" />
      <line x1="14" x2="14" y1="18" y2="11" />
      <line x1="18" x2="18" y1="18" y2="11" />
      <polygon points="12 2 20 7 4 7" />
    </svg>
  );
}

function ResultIcon({ kind }: { kind: "check" | "x" }) {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      stroke={INK.onFill}
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === "check" && <path d="M20 6 9 17l-5-5" />}
      {kind === "x" && <path d="M18 6 6 18" />}
      {kind === "x" && <path d="m6 6 12 12" />}
    </svg>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: BRAND_NAVY,
        color: INK.title,
        fontFamily: OG_FONT_TEXT,
      }}
    >
      <div style={{ display: "flex", height: 10, flexShrink: 0 }}>
        <div style={{ flex: 1, background: BRAND_NAVY, borderBottom: `2px solid ${BRAND_PAGE}` }} />
        <div style={{ flex: 1, background: BRAND_PAGE }} />
        <div style={{ flex: 1, background: BRAND_RED }} />
      </div>
      {children}
    </div>
  );
}

function Wordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <img src={OWL_DATA_URI} width={48} height={48} alt="" />
      <span
        style={{
          fontFamily: OG_FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 30,
          letterSpacing: -0.5,
          color: INK.title,
        }}
      >
        Poligraph
      </span>
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [scrutin, fonts] = await Promise.all([findScrutin(slug), loadOgFonts()]);

  if (!scrutin) {
    return new ImageResponse(
      <Frame>
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            fontSize: 32,
            color: INK.muted,
          }}
        >
          Scrutin non trouvé
        </div>
      </Frame>,
      { ...OG_SIZE, fonts }
    );
  }

  const headline = scrutinOgHeadline(toPublicTitleView(scrutin));
  const headlineSize = scrutinOgHeadlineSize(headline);
  const { total, segments } = scrutinOgSegments(scrutin);
  const badge = RESULT_BADGE[scrutin.result];
  const chamberLabel = CHAMBER_LABELS[scrutin.chamber];
  const chamberChip = CHAMBER_CHIP[scrutin.chamber];
  const scrutinNumber = extractScrutinNumber(scrutin.externalId);

  let kicker = `Vote du ${formatDate(scrutin.votingDate)}`;
  if (scrutinNumber) kicker = `${kicker} · Scrutin n° ${scrutinNumber}`;

  let themeLabel: string | null = null;
  if (scrutin.theme) themeLabel = THEME_CATEGORY_LABELS[scrutin.theme];

  return new ImageResponse(
    <Frame>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: "36px 64px 0 64px",
          gap: 22,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Wordmark />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 16px",
                border: `2px solid ${chamberChip.border}`,
                borderRadius: 999,
                color: chamberChip.text,
                fontWeight: 700,
                fontSize: 21,
              }}
            >
              <ChamberIcon color={chamberChip.text} />
              <span>{chamberLabel}</span>
            </div>
            {themeLabel && (
              <div
                style={{
                  display: "flex",
                  padding: "8px 16px",
                  border: `2px solid ${INK.chipBorder}`,
                  borderRadius: 999,
                  color: INK.chipText,
                  fontWeight: 700,
                  fontSize: 21,
                }}
              >
                {themeLabel}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", fontSize: 23, fontWeight: 700, color: INK.muted }}>
            {kicker}
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: OG_FONT_DISPLAY,
              fontWeight: 700,
              fontSize: headlineSize,
              lineHeight: 1.1,
              letterSpacing: -0.8,
              color: INK.title,
            }}
          >
            {headline}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 22px 10px 16px",
                background: badge.fill,
                color: INK.onFill,
                borderRadius: 10,
                fontFamily: OG_FONT_DISPLAY,
                fontWeight: 800,
                fontSize: 32,
              }}
            >
              <ResultIcon kind={badge.icon} />
              <span>{badge.label}</span>
            </div>
            {total > 0 && (
              <div style={{ display: "flex", gap: 8, fontSize: 26, color: INK.title }}>
                <span style={{ fontWeight: 700 }}>{`${total}`}</span>
                <span>votants</span>
              </div>
            )}
          </div>

          {total > 0 && (
            <div
              style={{
                display: "flex",
                height: 26,
                borderRadius: 6,
                overflow: "hidden",
                background: INK.track,
              }}
            >
              {segments
                .filter((segment) => segment.count > 0)
                .map((segment) => (
                  <div
                    key={segment.key}
                    style={{
                      display: "flex",
                      width: `${segment.share}%`,
                      minWidth: MIN_SEGMENT_PX,
                      background: VOTE_FILL[segment.key],
                    }}
                  />
                ))}
            </div>
          )}

          {total > 0 && (
            <div style={{ display: "flex", gap: 36, fontSize: 25, color: INK.body }}>
              {segments.map((segment) => (
                <div key={segment.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      display: "flex",
                      width: 16,
                      height: 16,
                      borderRadius: 4,
                      background: VOTE_FILL[segment.key],
                    }}
                  />
                  <span>{segment.label}</span>
                  <span style={{ fontWeight: 700 }}>{`${segment.count}`}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "22px 64px 28px 64px",
          marginTop: 22,
          borderTop: `1px solid ${INK.rule}`,
        }}
      >
        <span style={{ fontSize: 20, color: INK.muted }}>
          {`Source officielle : ${chamberLabel}`}
        </span>
        <span
          style={{ fontFamily: OG_FONT_DISPLAY, fontWeight: 800, fontSize: 24, color: INK.title }}
        >
          poligraph.fr
        </span>
      </div>
    </Frame>,
    { ...OG_SIZE, fonts }
  );
}
