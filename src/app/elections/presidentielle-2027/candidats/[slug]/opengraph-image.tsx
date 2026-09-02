import { ImageResponse } from "next/og";
import { candidacyRoleLabel } from "@/config/labels";
import { PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";
import { db } from "@/lib/db";
import { loadOgPortrait, OgLayout, OG_SIZE } from "@/lib/og-utils";
import { PRESIDENTIELLE_2027_SLUG } from "@/lib/presidentielle/themes";

/**
 * Preview card for ONE candidacy fiche, with the candidate's portrait.
 *
 * The hub's `opengraph-image` covers every descendant segment that does not define its
 * own, and the comment there explains why we create as few of these routes as possible
 * (each one is crawl budget spent on an image URL). This is the one exception: a fiche
 * is about a person, and a shared card showing the hub's headline is what a reader sees
 * when the link is pasted anywhere. The face is the whole content of the preview.
 *
 * Nothing perishable is rendered. No measure count, no candidacy status, no party: a
 * card is cached by every platform that ever fetched it, so a candidacy announced today
 * and withdrawn in March would keep being shared as "annoncée" with no way to correct
 * it. Name, gender-agreed role and portrait are the parts that stay true — the same
 * reasoning as the hub's card, restated because the temptation here is stronger.
 *
 * As on the hub, no `twitter-image` beside it: that is a different route family which
 * neither the X-Robots-Tag rule nor the robots.txt rule would match. X falls back to
 * og:image and crops it to 2:1, so nothing that must be read sits in the top or bottom
 * 20 pixels.
 */

export const alt = "Fiche de candidature à la présidentielle 2027 sur Poligraph";
export const size = OG_SIZE;
export const contentType = "image/png";
/** Same window as the fiche: a portrait changes at the pace of a sync, not of a request. */
export const revalidate = 86400;

const ACCENT = "#7dd3fc";

/** Called, not rendered as an element: the fallback shares the layout, not a component. */
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

  // A deliberately narrow read rather than `getPolitician`: that one loads the whole
  // fiche (mandates, affairs, declarations) for four fields, and its cache entry is
  // warmed by the page, not by a crawler hitting the image URL on its own.
  const politician = await db.politician.findUnique({
    where: { slug, ...PUBLIC_POLITICIAN_WHERE },
    select: {
      fullName: true,
      firstName: true,
      lastName: true,
      civility: true,
      photoUrl: true,
      blobPhotoUrl: true,
      candidacies: {
        // The same three conditions that make a candidacy sayable at all, see
        // `loadPoliticianPresidentialCandidacy`. Without one of them the fiche redirects
        // to /politiques/[slug] and this card describes a page nobody can reach.
        where: {
          election: { slug: PRESIDENTIELLE_2027_SLUG },
          status: { not: null },
          sourceUrl: { not: null },
          sourceLabel: { not: null },
        },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!politician || politician.candidacies.length === 0) {
    return new ImageResponse(fallbackCard("Candidature non trouvée"), { ...OG_SIZE });
  }

  // The Blob copy wins when there is one, exactly as in `PoliticianAvatar`: it is the
  // portrait cropped on the face, and it is served from our own CDN.
  const portrait = await loadOgPortrait(politician.blobPhotoUrl ?? politician.photoUrl);
  const initials = `${politician.firstName[0] ?? ""}${politician.lastName[0] ?? ""}`.toUpperCase();

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
            Présidentielle 2027
          </span>

          {/* Sized for a 500px-wide card in a feed, which is the only place this is seen.
              Long names ("Jean-Luc Mélenchon") still fit on two lines at this size. */}
          <span
            style={{
              fontSize: 72,
              fontWeight: 800,
              lineHeight: 1.03,
              letterSpacing: -2,
              color: "white",
            }}
          >
            {politician.fullName}
          </span>

          <span style={{ fontSize: 30, color: "#cbd5e1" }}>
            {candidacyRoleLabel(politician.civility)}
          </span>

          <span style={{ fontSize: 26, color: "#94a3b8" }}>
            Ses propositions, par thème, avec leurs sources.
          </span>
        </div>
      </div>
    </OgLayout>,
    { ...OG_SIZE }
  );
}
