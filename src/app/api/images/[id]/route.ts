import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { uploadSourcePhotoCopy } from "@/lib/photos/blob";
import { withPublicRoute } from "@/lib/api/with-public-route";
import { fetchPublicPhoto } from "@/lib/api/fetch-public-photo";

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

  // Cache miss — download from source, upload to Blob. The route is public, so the download goes
  // through the SSRF guard: https only, no internal address, every redirect checked again.
  //
  // A 200 does not mean an image. Public French institutional sites answer an interstitial or a
  // blocking page with a 200 and an HTML body, and this route used to store that body verbatim.
  // Once written, the cache-hit branch above redirects to it forever without ever looking again.
  // Measured on production before the first guard: 136 of 1428 cached photos were HTML. The bytes
  // are identified by their signature, which also rejects the NosSénateurs placeholder.
  const fetched = await fetchPublicPhoto(politician.photoUrl);
  if (fetched.kind === "unreachable") return redirectToSource(politician.photoUrl);
  if (fetched.kind !== "photo") return new NextResponse(null, { status: 404 });

  try {
    const blobUrl = await uploadSourcePhotoCopy(id!, fetched.buffer, fetched.contentType);

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
    // Blob upload failed — fall back to source URL directly
    return redirectToSource(politician.photoUrl);
  }
});

function redirectToSource(photoUrl: string) {
  return NextResponse.redirect(photoUrl, {
    status: 302,
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  });
}
