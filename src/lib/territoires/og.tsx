import { truncateOg } from "@/lib/og-utils";
import type { PhraseSegment } from "@/lib/territoires/commune-bandeau";

/**
 * Body of the Open Graph image shared by the Territoires pages (commune, département, région),
 * so the three say the same things as their banner: name, answer sentence, a line of facts, the
 * code of the territory as a large figure and its outline.
 *
 * Called as a function, not rendered as a component: Satori needs plain elements, every `div`
 * with several children declares `display: flex`, and text is concatenated before it gets there.
 */

const SHAPE = 250;

/**
 * First sentence of a banner phrase, as plain text: an image cannot carry the link to a note, so
 * the complements that point to one are left to the page.
 */
export function phraseTexte(segments: PhraseSegment[]): string {
  const end = segments.findIndex((s) => s.text.trimEnd().endsWith("."));
  return segments
    .slice(0, end === -1 ? segments.length : end + 1)
    .map((s) => s.text)
    .join("")
    .trim();
}

export function territoireOg(props: {
  surtitre: string;
  nom: string;
  /** Official code, drawn large and faint: the outline figure of the banner. */
  code: string;
  phrase: string;
  faits: string[];
  /** Data URI of the outline, when the territory has one. */
  shape: string | null;
  /** For an outline drawn in solid white, so the three images share the same faint shape. */
  shapeOpacity?: number;
}) {
  const nom = truncateOg(props.nom, 40);
  const nomSize = nom.length > 25 ? 52 : nom.length > 15 ? 64 : 76;
  return (
    <div style={{ display: "flex", flex: 1 }}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", fontSize: 24, color: "#cbd5e1", marginBottom: 16 }}>
          {props.surtitre}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: nomSize,
            fontWeight: 800,
            color: "white",
            lineHeight: 1.1,
            marginBottom: 24,
          }}
        >
          {nom}
        </div>
        <div style={{ display: "flex", fontSize: 32, color: "white", marginBottom: 16 }}>
          {truncateOg(props.phrase, 120)}
        </div>
        {props.faits.length > 0 && (
          <div style={{ display: "flex", fontSize: 26, color: "#cbd5e1" }}>
            {props.faits.join(" · ")}
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          width: SHAPE + 40,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 84,
            fontWeight: 800,
            lineHeight: 1,
            color: "rgba(255, 255, 255, 0.18)",
            marginBottom: 12,
          }}
        >
          {props.code}
        </div>
        {props.shape && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={props.shape}
            width={SHAPE}
            height={SHAPE}
            alt=""
            style={{ objectFit: "contain", opacity: props.shapeOpacity ?? 1 }}
          />
        )}
      </div>
    </div>
  );
}

export const TERRITOIRE_OG_SHAPE = SHAPE;
