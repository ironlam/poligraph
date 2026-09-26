import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { withPublicRoute } from "@/lib/api/with-public-route";

export const dynamic = "force-dynamic";

export const GET = withPublicRoute(async (_req, { params }) => {
  const { id } = await params;

  const politician = await db.politician.findUnique({
    where: { id },
    select: { photoUrl: true, blobPhotoUrl: true },
  });

  if (!politician?.photoUrl) {
    return new NextResponse(null, { status: 404 });
  }

  // Cache hit — redirect to Blob CDN
  if (politician.blobPhotoUrl) {
    return NextResponse.redirect(politician.blobPhotoUrl, {
      status: 302,
      headers: {
        "Cache-Control": "public, max-age=86400, s-maxage=2592000",
      },
    });
  }

  // Cache miss — download from source, upload to Blob
  try {
    const sourceResponse = await fetch(politician.photoUrl, {
      signal: AbortSignal.timeout(10000),
    });

    if (!sourceResponse.ok || !sourceResponse.body) {
      return new NextResponse(null, { status: 404 });
    }

    // Media types are case-insensitive and may carry parameters, so the header is normalised
    // before it decides anything and before it is stored. Same shape as `loadOgPortrait`.
    const contentType = (sourceResponse.headers.get("content-type") ?? "")
      .split(";")[0]
      ?.trim()
      .toLowerCase();

    // A 200 does not mean an image. Public French institutional sites answer an interstitial or a
    // blocking page with a 200 and an HTML body, and this route used to store that body verbatim,
    // copying `text/html` into the blob's own content type. Once written, the cache-hit branch
    // above redirects to it forever without ever looking again, so the fiche served an 8 KB web
    // page as a portrait and `/_next/image` answered 400. Measured on production before this
    // guard: 136 of 1428 cached photos were HTML.
    //
    // No default content type either. `|| "image/jpeg"` was the other half of the hole: a source
    // that sends no header at all would have had its body labelled as a JPEG on our side.
    if (!contentType || !contentType.startsWith("image/")) {
      return new NextResponse(null, { status: 404 });
    }

    const blob = await put(`politicians/${id}`, sourceResponse.body, {
      access: "public",
      contentType,
    });

    // Save Blob URL to DB
    await db.politician.update({
      where: { id },
      data: { blobPhotoUrl: blob.url },
    });

    return NextResponse.redirect(blob.url, {
      status: 302,
      headers: {
        "Cache-Control": "public, max-age=86400, s-maxage=2592000",
      },
    });
  } catch {
    // Source download failed — fall back to source URL directly
    return NextResponse.redirect(politician.photoUrl, {
      status: 302,
      headers: {
        "Cache-Control": "public, max-age=3600",
      },
    });
  }
});
