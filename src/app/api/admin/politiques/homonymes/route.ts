import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { findHomonyms } from "@/lib/politicians/homonyms";

const querySchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
});

/**
 * GET /api/admin/politiques/homonymes?firstName=&lastName=
 * The existing profiles a new one could be confused with, whatever their publication status.
 */
export const GET = withAdminAuth(async (request: NextRequest) => {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ error: "Prénom et nom requis" }, { status: 400 });
  }
  const homonyms = await findHomonyms(db, parsed.data.firstName, parsed.data.lastName);
  return NextResponse.json({ homonyms });
});
