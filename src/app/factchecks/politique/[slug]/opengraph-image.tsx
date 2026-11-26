import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { OgLayout, OgCategoryLabel, OG_SIZE, truncateOg } from "@/lib/og-utils";
import { VERDICT_GROUP_COLORS, VERDICT_GROUP_LABELS } from "@/config/labels";
import { VERDICT_GROUP_KEYS, getPoliticianFactCheckLanding } from "@/lib/data/factcheck-politician";

export const alt = "Les déclarations vérifiées d'une personnalité politique, sur Poligraph";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const landing = await getPoliticianFactCheckLanding(slug);
  if (!landing) notFound();

  const { author, claimed, about, bySource } = landing;
  // A page about someone with no checked claim of their own shows what is checked about them.
  const aboutOnly = claimed.length === 0 && about.length > 0;
  const breakdown = aboutOnly ? landing.aboutBreakdown : landing.breakdown;
  const line = aboutOnly
    ? `${about.length} fact-check${about.length > 1 ? "s" : ""} à son sujet`
    : `${claimed.length} déclaration${claimed.length > 1 ? "s" : ""} vérifiée${claimed.length > 1 ? "s" : ""}, ${bySource.length} rédaction${bySource.length > 1 ? "s" : ""}`;

  return new ImageResponse(
    <OgLayout>
      <OgCategoryLabel emoji="🔍" label="Fact-checks" />
      <div style={{ fontSize: 48, fontWeight: 700, color: "white", marginBottom: 16 }}>
        {truncateOg(author.fullName, 60)}
      </div>
      <div style={{ fontSize: 30, color: "#cbd5e1", marginBottom: 32 }}>{line}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
        {VERDICT_GROUP_KEYS.filter((g) => breakdown[g] > 0).map((group) => (
          <div key={group} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: 9,
                backgroundColor: VERDICT_GROUP_COLORS[group],
              }}
            />
            <span style={{ fontSize: 26, color: "white" }}>
              {`${VERDICT_GROUP_LABELS[group]} : ${breakdown[group]}`}
            </span>
          </div>
        ))}
      </div>
    </OgLayout>,
    { ...OG_SIZE }
  );
}
