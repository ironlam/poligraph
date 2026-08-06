import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation, getRequestMeta } from "@/lib/security";
import { createPartyMembershipSchema } from "@/lib/security/schemas/party";
import { invalidateEntity } from "@/lib/cache";
import { setCurrentParty, findCurrentOpenMembership } from "@/services/politician";
import { findOverlaps, type AffiliationInterval } from "@/lib/politicians/party-overlap";
import type { z } from "zod/v4";

type CreateBody = z.infer<typeof createPartyMembershipSchema>;

function bad(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

export const POST = withAdminAuth(
  withValidation(createPartyMembershipSchema, async (request, context, body: CreateBody) => {
    const { id } = await context.params;

    const politician = await db.politician.findUnique({
      where: { id },
      select: { id: true, slug: true, currentPartyId: true },
    });

    if (!politician) {
      return NextResponse.json({ error: "Politicien non trouvé" }, { status: 404 });
    }

    const startDate = body.startDate ? new Date(body.startDate) : null;
    const endDate = body.endDate ? new Date(body.endDate) : null;
    const isOpen = body.mode !== "closed";

    if (startDate && endDate && startDate >= endDate) {
      return bad("La date de début doit être antérieure à la date de fin");
    }
    if (body.mode === "closed" && !endDate) {
      return bad("Une affiliation close exige une date de fin");
    }
    if (isOpen && endDate) {
      return bad("Une affiliation en cours ne peut pas porter de date de fin");
    }

    // The affiliation currentPartyId points at. A politician can hold several open
    // affiliations, so this is not simply the most recent open one.
    const currentMembership = await findCurrentOpenMembership(
      politician.id,
      politician.currentPartyId
    );

    if (body.mode === "succeeds") {
      if (!startDate) {
        return bad("Une succession exige une date de début");
      }
      if (politician.currentPartyId === body.partyId) {
        return bad("Ce parti est déjà l'affiliation actuelle");
      }
      if (currentMembership?.startDate && startDate < currentMembership.startDate) {
        return bad("La succession ne peut pas commencer avant l'affiliation qu'elle remplace");
      }
    }

    if (body.mode === "parallel" && !politician.currentPartyId) {
      return bad("Une affiliation en parallèle exige un parti actuel. Utilisez la succession.");
    }

    // Overlaps are computed on the state that will exist after the write: in a
    // succession the affiliation about to be closed is projected with its future
    // endDate, so a clean party change reports nothing.
    const existing = await db.partyMembership.findMany({
      where: { politicianId: politician.id },
      select: {
        id: true,
        partyId: true,
        startDate: true,
        endDate: true,
        party: { select: { shortName: true } },
      },
    });

    // In a succession, an open membership already sitting on body.partyId is not a
    // separate affiliation that will coexist with the candidate: it IS the candidate
    // after the write (setCurrentParty promotes it). Drop it from the projection
    // entirely rather than giving it a projected bound.
    const projected: AffiliationInterval[] = existing
      .filter(
        (membership) =>
          !(
            body.mode === "succeeds" &&
            membership.partyId === body.partyId &&
            membership.endDate === null
          )
      )
      .map((membership) => ({
        partyId: membership.partyId,
        partyShortName: membership.party.shortName,
        startDate: membership.startDate,
        endDate:
          body.mode === "succeeds" && membership.id === currentMembership?.id
            ? startDate
            : membership.endDate,
      }));

    const warnings = findOverlaps(
      {
        partyId: body.partyId,
        partyShortName: "",
        startDate,
        endDate,
      },
      projected
    );

    let membershipId: string | null = null;
    let closedMembershipId: string | null = null;

    if (body.mode === "succeeds") {
      const result = await setCurrentParty(politician.id, body.partyId, {
        startDate: startDate!,
        ...(body.role && { role: body.role }),
      });
      membershipId = result.membershipId;
      closedMembershipId = result.closedMembershipId;
    } else {
      const created = await db.partyMembership.create({
        data: {
          politicianId: politician.id,
          partyId: body.partyId,
          startDate,
          endDate,
          ...(body.role && { role: body.role }),
        },
      });
      membershipId = created.id;
    }

    const meta = getRequestMeta(request);
    await db.auditLog.create({
      data: {
        action: "CREATE",
        entityType: "PartyMembership",
        entityId: membershipId!,
        changes: {
          mode: body.mode,
          partyId: body.partyId,
          role: body.role ?? null,
          startDate: body.startDate ?? null,
          endDate: body.endDate ?? null,
          closedMembershipId,
          previousCurrentPartyId: politician.currentPartyId,
          currentPartyChanged: body.mode === "succeeds",
        },
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    invalidateEntity("politician", politician.slug);

    return NextResponse.json({ success: true, warnings });
  })
);
