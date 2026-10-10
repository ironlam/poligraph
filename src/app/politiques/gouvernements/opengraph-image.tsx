import { ImageResponse } from "next/og";
import { OgLayout, OG_SIZE } from "@/lib/og-utils";

/**
 * Card for the directory and the members page (a segment's image covers its children unless
 * they define their own; each government has its own). Static text only: no count, which a
 * cached card would keep showing after the next government is published.
 */

export const alt = "Gouvernements français sur Poligraph";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <OgLayout>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          justifyContent: "center",
          gap: 24,
        }}
      >
        <span
          style={{
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: "#7dd3fc",
          }}
        >
          Gouvernements
        </span>
        <span
          style={{
            fontSize: 72,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: -2,
            color: "white",
          }}
        >
          Qui était au gouvernement, et quand ?
        </span>
        <span style={{ fontSize: 30, color: "#cbd5e1" }}>
          La composition jour par jour, chaque nomination sourcée par le Journal officiel.
        </span>
      </div>
    </OgLayout>,
    { ...OG_SIZE }
  );
}
