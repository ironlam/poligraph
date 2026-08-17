import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { OgLayout, OgCategoryLabel, OgBadge, OG_SIZE, truncateOg } from "@/lib/og-utils";
import type { FactCheckRating } from "@/generated/prisma";
import { getPublicFactCheckWhere } from "@/lib/api/public-contract";

export const alt = "Fact-check sur Poligraph";
export const size = OG_SIZE;
export const contentType = "image/png";

const RATING_LABELS: Partial<Record<FactCheckRating, string>> = {
  TRUE: "Vrai",
  MOSTLY_TRUE: "Plutôt vrai",
  HALF_TRUE: "Partiellement vrai",
  MISLEADING: "Trompeur",
  OUT_OF_CONTEXT: "Hors contexte",
  MOSTLY_FALSE: "Plutôt faux",
  FALSE: "Faux",
  UNVERIFIABLE: "Invérifiable",
};

const RATING_COLORS: Partial<Record<FactCheckRating, string>> = {
  TRUE: "#22c55e",
  MOSTLY_TRUE: "#4ade80",
  HALF_TRUE: "#eab308",
  MISLEADING: "#f97316",
  OUT_OF_CONTEXT: "#f59e0b",
  MOSTLY_FALSE: "#f87171",
  FALSE: "#ef4444",
  UNVERIFIABLE: "#6b7280",
};

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const factCheck = await db.factCheck.findFirst({
    where: { slug, ...getPublicFactCheckWhere() },
    select: {
      title: true,
      claimText: true,
      verdictRating: true,
      source: true,
    },
  });

  if (!factCheck) {
    notFound();
  }

  const ratingLabel = RATING_LABELS[factCheck.verdictRating] || factCheck.verdictRating;
  const ratingColor = RATING_COLORS[factCheck.verdictRating] || "#94a3b8";

  return new ImageResponse(
    <OgLayout>
      <OgCategoryLabel emoji="🔍" label="Fact-check" />

      {/* Claim — single text node (Satori rejects multi-child divs without display:flex) */}
      {factCheck.claimText && (
        <div
          style={{
            fontSize: 30,
            color: "#cbd5e1",
            marginBottom: 20,
            fontStyle: "italic",
          }}
        >
          {`« ${truncateOg(factCheck.claimText, 150)} »`}
        </div>
      )}

      {/* Title */}
      <div
        style={{
          fontSize: 36,
          fontWeight: 700,
          color: "white",
          marginBottom: 28,
        }}
      >
        {truncateOg(factCheck.title, 120)}
      </div>

      {/* Verdict badge + source */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <OgBadge label={`Verdict : ${ratingLabel}`} color={ratingColor} />
        {factCheck.source && (
          <span style={{ fontSize: 20, color: "#64748b" }}>Source : {factCheck.source}</span>
        )}
      </div>
    </OgLayout>,
    { ...OG_SIZE }
  );
}
