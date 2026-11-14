/**
 * The navy card frame shared by the Open Graph images that carry data (scrutins, groupes):
 * tricolour band, owl wordmark, ink scale and vote fills read on navy, and the footer line.
 *
 * Every element with several children declares `display: flex`: Satori has no block layout.
 * Pair with `loadOgFonts()`, whose families these components name.
 */
import { BRAND_NAVY, BRAND_PAGE, BRAND_RED } from "@/config/brand";
import { OWL_DATA_URI } from "@/lib/og-utils";
import { OG_FONT_DISPLAY, OG_FONT_TEXT } from "@/lib/og/fonts";

export const OG_INK = {
  title: "#ffffff",
  body: "#e6ebf2",
  muted: "#b8c4d6",
  rule: "#23416b",
  track: "#1c3a63",
  chipBorder: "#4a6286",
  chipText: "#c9d3e1",
  onFill: "#1a1a2e",
};

/** The dark-theme vote tokens of the design system: desaturated, so neither side reads as good. */
export const OG_VOTE_FILL = {
  pour: "#7ab892",
  contre: "#c88a8a",
  abstention: "#92959c",
} as const;

/** Assemblée chip, the same blue as on the scrutin card. */
export const OG_AN_CHIP = { border: "#60a5fa", text: "#9cc6fb" };

export function OgBrandFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: BRAND_NAVY,
        color: OG_INK.title,
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

export function OgWordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori draws <img>, not next/image */}
      <img src={OWL_DATA_URI} width={48} height={48} alt="" />
      <span
        style={{
          fontFamily: OG_FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 30,
          letterSpacing: -0.5,
          color: OG_INK.title,
        }}
      >
        Poligraph
      </span>
    </div>
  );
}

export function OgChip({
  label,
  color = { border: OG_INK.chipBorder, text: OG_INK.chipText },
}: {
  label: string;
  color?: { border: string; text: string };
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "8px 16px",
        border: `2px solid ${color.border}`,
        borderRadius: 999,
        color: color.text,
        fontWeight: 700,
        fontSize: 21,
      }}
    >
      {label}
    </div>
  );
}

/** Source line on the left, the domain on the right, under a rule. */
export function OgFooter({ source }: { source: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "22px 64px 28px 64px",
        marginTop: 22,
        borderTop: `1px solid ${OG_INK.rule}`,
      }}
    >
      <span style={{ fontSize: 20, color: OG_INK.muted }}>{source}</span>
      <span
        style={{ fontFamily: OG_FONT_DISPLAY, fontWeight: 800, fontSize: 24, color: OG_INK.title }}
      >
        poligraph.fr
      </span>
    </div>
  );
}
