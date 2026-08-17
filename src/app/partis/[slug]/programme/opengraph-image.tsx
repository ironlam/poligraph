import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { OgLayout, OgCategoryLabel, OG_SIZE } from "@/lib/og-utils";
import { PUBLIC_PARTY_WHERE } from "@/lib/api/public-contract";

export const alt = "Programme du parti sur Poligraph";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const platform = await db.platform.findFirst({
    where: {
      party: { slug, ...PUBLIC_PARTY_WHERE },
      publicationStatus: "PUBLISHED",
    },
    include: {
      party: {
        select: { name: true, shortName: true, color: true, logoUrl: true },
      },
      election: { select: { title: true } },
      _count: { select: { proposals: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!platform?.party) {
    return new ImageResponse(
      <OgLayout>
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: 32,
          }}
        >
          Programme non trouvé
        </div>
      </OgLayout>,
      { ...OG_SIZE }
    );
  }

  const party = platform.party;
  const color = party.color || "#6366f1";

  return new ImageResponse(
    <OgLayout>
      <OgCategoryLabel emoji="📋" label="Programme" />

      <div style={{ display: "flex", flex: 1, alignItems: "center" }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", marginRight: 48 }}>
          {party.logoUrl ? (
            <img
              src={party.logoUrl}
              alt=""
              width={140}
              height={140}
              style={{ objectFit: "contain", borderRadius: 16 }}
            />
          ) : (
            <div
              style={{
                width: 140,
                height: 140,
                borderRadius: 16,
                background: color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: 52,
                fontWeight: 700,
              }}
            >
              {party.shortName.substring(0, 3)}
            </div>
          )}
        </div>

        {/* Info */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: 1,
          }}
        >
          <div style={{ fontSize: 38, fontWeight: 700, color: "white", marginBottom: 12 }}>
            {`Programme de ${party.name}`}
          </div>

          {/* Short name pill */}
          <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "6px 16px",
                borderRadius: 999,
                background: `${color}33`,
                border: `2px solid ${color}`,
                color,
                fontSize: 22,
                fontWeight: 600,
              }}
            >
              {party.shortName}
            </div>
          </div>

          {/* Axes count + election */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 24, color: "#94a3b8" }}>
              {`${platform._count.proposals} axe${platform._count.proposals > 1 ? "s" : ""} thématique${platform._count.proposals > 1 ? "s" : ""}`}
            </span>
            {platform.election && (
              <span style={{ fontSize: 20, color: "#64748b" }}>{platform.election.title}</span>
            )}
          </div>
        </div>
      </div>
    </OgLayout>,
    { ...OG_SIZE }
  );
}
