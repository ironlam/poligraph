import type { ProgramOwnerType } from "@/generated/prisma";
import { db } from "@/lib/db";
import { MeasureValidationError } from "./errors";

export type CreateProgramEditionInput = {
  electionId: string;
  ownerType: ProgramOwnerType;
  partyId: string | null;
  candidacyId: string | null;
  label: string;
  version: number;
  publishedAt: Date;
  documentUrl: string;
};

/**
 * Exactly one owner, and ownerType must agree with the field that is set.
 *
 * The schema cannot express this: both columns are independently nullable, and the two
 * unique constraints only bite once an owner is chosen. So the guard lives here, and this
 * is the only authorized way to create an edition.
 */
export async function createProgramEdition(
  input: CreateProgramEditionInput
): Promise<{ programEditionId: string }> {
  const owners = [input.partyId, input.candidacyId].filter((id) => id !== null);
  if (owners.length !== 1) {
    throw new MeasureValidationError(
      "Une édition de programme doit avoir exactement un propriétaire, parti ou candidature"
    );
  }
  // ownerType is what tells every consumer which column to read. If it disagrees with the
  // column that is set, they all read the wrong one and get null.
  const declared = input.ownerType === "PARTY" ? input.partyId : input.candidacyId;
  if (declared === null) {
    throw new MeasureValidationError(
      `Le propriétaire déclaré (${input.ownerType}) ne correspond pas au champ renseigné`
    );
  }

  const edition = await db.programEdition.create({
    data: {
      electionId: input.electionId,
      ownerType: input.ownerType,
      partyId: input.partyId,
      candidacyId: input.candidacyId,
      label: input.label,
      version: input.version,
      publishedAt: input.publishedAt,
      documentUrl: input.documentUrl,
    },
  });

  return { programEditionId: edition.id };
}
