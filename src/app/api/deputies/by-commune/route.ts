import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withCache } from "@/lib/cache";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { USER_AGENT } from "@/config/site";

/**
 * @openapi
 * /api/deputies/by-commune:
 *   get:
 *     summary: Représentants par commune
 *     description: >
 *       Retourne le député de la circonscription et les sénateurs du département
 *       pour une commune donnée (par code INSEE ou coordonnées GPS).
 *     tags: [Géographie]
 *     parameters:
 *       - in: query
 *         name: inseeCode
 *         schema:
 *           type: string
 *         description: Code INSEE de la commune (e.g. "75056")
 *       - in: query
 *         name: lat
 *         schema:
 *           type: number
 *         description: Latitude (requiert lon)
 *       - in: query
 *         name: lon
 *         schema:
 *           type: number
 *         description: Longitude (requiert lat)
 *     responses:
 *       200:
 *         description: Député et sénateurs de la commune
 *       400:
 *         description: Paramètres invalides
 *       404:
 *         description: Commune non trouvée
 */
export const GET = withPublicRoute(async (request: NextRequest) => {
  const searchParams = request.nextUrl.searchParams;
  const inseeCode = searchParams.get("inseeCode");
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");

  // --- Input validation ---
  if (!inseeCode && (!lat || !lon)) {
    return NextResponse.json(
      { error: "Paramètre 'inseeCode' ou 'lat'+'lon' requis" },
      { status: 400 }
    );
  }

  let resolvedInseeCode = inseeCode;

  // --- Mode 1: Reverse geocode from lat/lon ---
  if (!resolvedInseeCode && lat && lon) {
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);

    if (
      isNaN(latNum) ||
      isNaN(lonNum) ||
      latNum < -90 ||
      latNum > 90 ||
      lonNum < -180 ||
      lonNum > 180
    ) {
      return NextResponse.json({ error: "Coordonnées invalides" }, { status: 400 });
    }

    // France bounding box (metropolitan + overseas approximate)
    if (latNum < -22 || latNum > 51.5 || lonNum < -63 || lonNum > 56) {
      return NextResponse.json(
        { error: "Coordonnées hors du territoire français" },
        { status: 400 }
      );
    }

    const geoUrl = `https://geo.api.gouv.fr/communes?lat=${latNum}&lon=${lonNum}&fields=code,nom&limit=1`;
    const geoResp = await fetch(geoUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });

    if (!geoResp.ok) {
      return NextResponse.json({ error: "Erreur lors de la géolocalisation" }, { status: 502 });
    }

    const geoData: { code: string; nom: string }[] = await geoResp.json();
    if (geoData.length === 0) {
      return NextResponse.json(
        { error: "Aucune commune trouvée à ces coordonnées" },
        { status: 404 }
      );
    }

    resolvedInseeCode = geoData[0]!.code;
  }

  // --- Validate INSEE code format ---
  if (!resolvedInseeCode || !/^[0-9A-Z]{5}$/.test(resolvedInseeCode)) {
    return NextResponse.json(
      { error: "Code INSEE invalide (format attendu: 5 caractères alphanumériques)" },
      { status: 400 }
    );
  }

  // --- Look up commune ---
  const commune = await db.commune.findUnique({
    where: { id: resolvedInseeCode },
    select: {
      id: true,
      name: true,
      departmentCode: true,
      departmentName: true,
      constituencyNumber: true,
    },
  });

  if (!commune) {
    return NextResponse.json({ error: "Commune non trouvée" }, { status: 404 });
  }

  // --- Find deputy for this constituency ---
  let deputy = null;
  let multipleDeputies = false;

  if (commune.constituencyNumber) {
    // Exact constituency lookup: find the deputy whose constituency string
    // contains the matching number for this department
    const deputies = await db.politician.findMany({
      where: {
        publicationStatus: "PUBLISHED",
        mandates: {
          some: {
            type: "DEPUTE",
            isCurrent: true,
            departmentCode: commune.departmentCode,
          },
        },
      },
      include: {
        currentParty: {
          select: { name: true, shortName: true, color: true },
        },
        mandates: {
          where: { type: "DEPUTE", isCurrent: true },
          select: { constituency: true },
          take: 1,
        },
      },
    });

    // Match by constituency number parsed from "DepartmentName (N)"
    const targetNum = commune.constituencyNumber;
    const match = deputies.find((d) => {
      const numStr = d.mandates[0]?.constituency?.match(/\((\d+)\)/)?.[1];
      return numStr ? parseInt(numStr, 10) === targetNum : false;
    });

    if (match) {
      deputy = {
        id: match.id,
        slug: match.slug,
        fullName: match.fullName,
        photoUrl: match.photoUrl,
        constituency: match.mandates[0]?.constituency || null,
        party: match.currentParty
          ? {
              name: match.currentParty.name,
              shortName: match.currentParty.shortName,
              color: match.currentParty.color,
            }
          : null,
      };
    }
  } else {
    // No constituency number → can't pinpoint, flag multiple
    multipleDeputies = true;
  }

  // --- Find senators for this department ---
  const senatorRows = await db.politician.findMany({
    where: {
      publicationStatus: "PUBLISHED",
      mandates: {
        some: {
          type: "SENATEUR",
          isCurrent: true,
          departmentCode: commune.departmentCode,
        },
      },
    },
    include: {
      currentParty: {
        select: { name: true, shortName: true, color: true },
      },
    },
    orderBy: { lastName: "asc" },
  });

  const senators = senatorRows.map((s) => ({
    id: s.id,
    slug: s.slug,
    fullName: s.fullName,
    photoUrl: s.photoUrl,
    party: s.currentParty
      ? {
          name: s.currentParty.name,
          shortName: s.currentParty.shortName,
          color: s.currentParty.color,
        }
      : null,
  }));

  return withCache(
    NextResponse.json({
      deputy,
      senators,
      commune: commune.name,
      department: commune.departmentName,
      departmentCode: commune.departmentCode,
      constituencyNumber: commune.constituencyNumber,
      multipleDeputies,
    }),
    "daily"
  );
});
