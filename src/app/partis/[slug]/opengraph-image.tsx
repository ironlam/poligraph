import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { OgLayout, OgCategoryLabel, OG_SIZE } from "@/lib/og-utils";
import { PUBLIC_PARTY_WHERE, PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";

export const alt = "Parti politique sur Poligraph";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const party = await db.party.findFirst({
    where: { slug, ...PUBLIC_PARTY_WHERE },
    select: {
      name: true,
      shortName: true,
      color: true,
      logoUrl: true,
      politicalPosition: true,
      _count: { select: { politicians: { where: PUBLIC_POLITICIAN_WHERE } } },
    },
  });

  if (!party) {
    notFound();
  }

  const color = party.color || "#6366f1";
  const memberCount = party._count.politicians;

  return new ImageResponse(
    <OgLayout>
      <OgCategoryLabel emoji="🏛️" label="Parti politique" />

      {/* Horizontal layout: logo on left, info on right */}
      <div style={{ display: "flex", flex: 1, alignItems: "center" }}>
        {/* Left: Logo or initials */}
        <div style={{ display: "flex", alignItems: "center", marginRight: 48 }}>
          {party.logoUrl ? (
            <img
              src={party.logoUrl}
              width={180}
              height={180}
              style={{ objectFit: "contain", borderRadius: 16 }}
            />
          ) : (
            <div
              style={{
                width: 180,
                height: 180,
                borderRadius: 16,
                background: color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: 64,
                fontWeight: 700,
              }}
            >
              {party.shortName.substring(0, 3)}
            </div>
          )}
        </div>

        {/* Right: Info */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: 1,
          }}
        >
          <div
            style={{
              fontSize: 40,
              fontWeight: 700,
              color: "white",
              marginBottom: 12,
            }}
          >
            {party.name}
          </div>

          {/* Short name pill badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "8px 20px",
                borderRadius: 999,
                background: `${color}33`,
                border: `2px solid ${color}`,
                color,
                fontSize: 24,
                fontWeight: 600,
              }}
            >
              {party.shortName}
            </div>
          </div>

          {/* Members count */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 28 }}>👥</span>
            <span style={{ fontSize: 28, color: "#94a3b8" }}>
              {memberCount} membre{memberCount > 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>
    </OgLayout>,
    { ...OG_SIZE }
  );
}
