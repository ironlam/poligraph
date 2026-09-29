import { ImageResponse } from "next/og";
import { OgLayout, OG_SIZE, OWL_DATA_URI, OgEmoji } from "@/lib/og-utils";

export const alt = "Poligraph - Observatoire citoyen de la vie politique";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    <OgLayout>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
        }}
      >
        {/* Owl logo */}
        <img src={OWL_DATA_URI} width={100} height={100} style={{ marginBottom: 32 }} />

        {/* Title */}
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: "white",
            marginBottom: 16,
            textAlign: "center",
          }}
        >
          Poligraph
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 28,
            color: "#94a3b8",
            marginBottom: 48,
            textAlign: "center",
          }}
        >
          Observatoire citoyen de la vie politique
        </div>

        {/* Feature icons */}
        <div
          style={{
            display: "flex",
            gap: 40,
            fontSize: 24,
            color: "#64748b",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <OgEmoji emoji="📜" size={28} />
            <span>Mandats</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <OgEmoji emoji="💰" size={28} />
            <span>Patrimoine</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <OgEmoji emoji="⚖️" size={28} />
            <span>Affaires judiciaires</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <OgEmoji emoji="🔍" size={28} />
            <span>Fact-checks</span>
          </div>
        </div>
      </div>
    </OgLayout>,
    {
      ...size,
    }
  );
}
