import { ImageResponse } from "next/og";
import { OgLayout, OG_SIZE, OgCategoryLabel, OgEmoji } from "@/lib/og-utils";

export const alt = "Parlement - Votes, dossiers législatifs et groupes parlementaires";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    <OgLayout>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          justifyContent: "center",
        }}
      >
        <OgCategoryLabel emoji="🏛️" label="Parlement" />

        <div
          style={{
            display: "flex",
            fontSize: 52,
            fontWeight: 700,
            color: "white",
            marginBottom: 20,
            lineHeight: 1.2,
          }}
        >
          {`Votes, dossiers législatifs et groupes parlementaires`}
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 24,
            color: "#94a3b8",
            lineHeight: 1.5,
          }}
        >
          {`Suivez les scrutins de l'Assemblée nationale et du Sénat`}
        </div>

        {/* Feature pills */}
        <div
          style={{
            display: "flex",
            gap: 16,
            marginTop: 40,
            flexWrap: "wrap",
          }}
        >
          {[
            { emoji: "🗳️", label: "Scrutins" },
            { emoji: "📋", label: "Dossiers" },
            { emoji: "👥", label: "Groupes" },
            { emoji: "📊", label: "Amendements" },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 20px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
                fontSize: 20,
                color: "#cbd5e1",
              }}
            >
              <OgEmoji emoji={item.emoji} size={20} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </OgLayout>,
    { ...size }
  );
}
