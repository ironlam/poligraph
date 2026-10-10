import { ImageResponse } from "next/og";
import { formatDay } from "@/components/governments/format";
import { PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";
import { getPublishedGovernments } from "@/lib/data/governments";
import { db } from "@/lib/db";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { loadOgPortrait, OgLayout, OG_SIZE } from "@/lib/og-utils";

/**
 * Preview card for one government, with the Prime Minister's portrait. The government's name
 * already carries the Prime Minister's (« Gouvernement Sébastien Lecornu II »).
 *
 * Nothing perishable is rendered, for the reason given on the candidacy card: platforms
 * cache a card for as long as they like. No member count (a reshuffle changes it), and a
 * government still in office gets its appointment date rather than "en fonction", which
 * would keep being shared after it ends. A closed government's range never changes.
 */

export const alt = "Composition d'un gouvernement sur Poligraph";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 86400;

const ACCENT = "#7dd3fc";

function fallbackCard(message: string) {
  return (
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
        {message}
      </div>
    </OgLayout>
  );
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  if (!(await isFeatureEnabled("gouvernements"))) {
    return new ImageResponse(fallbackCard("Gouvernement introuvable"), { ...OG_SIZE });
  }
  // Same lookup as the page, so the card never describes a government the page 404s on.
  const gov = (await getPublishedGovernments()).find((g) => g.slug === slug);
  if (!gov) {
    return new ImageResponse(fallbackCard("Gouvernement introuvable"), { ...OG_SIZE });
  }

  // Narrow read: the portrait is shown only when the Prime Minister's fiche is public.
  const pm = await db.politician.findUnique({
    where: { slug: gov.primeMinister.slug, ...PUBLIC_POLITICIAN_WHERE },
    select: { firstName: true, lastName: true, photoUrl: true, blobPhotoUrl: true },
  });
  const portrait = pm ? await loadOgPortrait(pm.blobPhotoUrl ?? pm.photoUrl) : null;
  const initials = pm ? `${pm.firstName[0] ?? ""}${pm.lastName[0] ?? ""}`.toUpperCase() : "";

  const dates = gov.endedAt
    ? `Du ${formatDay(gov.primeMinisterAppointedAt)} au ${formatDay(gov.endedAt)}`
    : `Nommé le ${formatDay(gov.primeMinisterAppointedAt)}`;

  return new ImageResponse(
    <OgLayout>
      <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 56 }}>
        {portrait ? (
          <img
            src={portrait}
            alt=""
            width={280}
            height={280}
            style={{
              flexShrink: 0,
              borderRadius: "50%",
              objectFit: "cover",
              border: `8px solid ${ACCENT}`,
            }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              width: 280,
              height: 280,
              flexShrink: 0,
              borderRadius: "50%",
              alignItems: "center",
              justifyContent: "center",
              background: "#1e293b",
              border: `8px solid ${ACCENT}`,
              color: "white",
              fontSize: 104,
              fontWeight: 700,
            }}
          >
            {initials}
          </div>
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: "center",
            gap: 18,
          }}
        >
          <span
            style={{
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: ACCENT,
            }}
          >
            Gouvernements
          </span>

          <span
            style={{
              fontSize: 68,
              fontWeight: 800,
              lineHeight: 1.03,
              letterSpacing: -2,
              color: "white",
            }}
          >
            {gov.name}
          </span>

          <span style={{ fontSize: 30, color: "#cbd5e1" }}>{dates}</span>

          <span style={{ fontSize: 24, color: "#94a3b8" }}>
            Sa composition jour par jour, chaque nomination sourcée par le Journal officiel.
          </span>
        </div>
      </div>
    </OgLayout>,
    { ...OG_SIZE }
  );
}
