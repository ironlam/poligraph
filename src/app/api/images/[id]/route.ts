import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { identifyPhoto } from "@/lib/photos/source-photo";
import { uploadSourcePhotoCopy } from "@/lib/photos/blob";
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

    if (!sourceResponse.ok) {
      return new NextResponse(null, { status: 404 });
    }

    // A 200 does not mean an image. Public French institutional sites answer an interstitial or a
    // blocking page with a 200 and an HTML body, and this route used to store that body verbatim.
    // Once written, the cache-hit branch above redirects to it forever without ever looking again.
    // Measured on production before the first guard: 136 of 1428 cached photos were HTML. The bytes
    // are now identified by their signature, which also rejects the NosSénateurs placeholder.
    const buffer = Buffer.from(await sourceResponse.arrayBuffer());
    const photo = identifyPhoto(buffer);
    if (!photo) {
      return new NextResponse(null, { status: 404 });
    }

    const blobUrl = await uploadSourcePhotoCopy(id!, buffer, photo.contentType);

    // Save Blob URL to DB
    await db.politician.update({
      where: { id },
      data: { blobPhotoUrl: blobUrl },
    });

    return NextResponse.redirect(blobUrl, {
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
