import type { Involvement } from "@/types";
import { INVOLVEMENT_LABELS } from "@/config/labels";

/**
 * Single source of truth for the "this person is not accused" wording, shared by
 * the role band on the affair page and the not_accused notice on compact
 * surfaces (listing card). Pure, so it unit-tests without a database.
 *
 * The subject is always "Cette personne" so the agreement stays feminine and
 * consistent without gendering the actual individual. Follows the imposed
 * vocabulary (legal-invariants.md): "mis en cause", "poursuivie", never
 * "coupable" / "innocentée".
 */
export interface RoleNoticeCopy {
  /** The role label, e.g. "Mentionné", "Victime", "Plaignant". */
  roleLabel: string;
  /** The role-specific position sentence. */
  position: string;
  /** The shared reminder that the qualifications do not target this person. */
  reminder: string;
}

const POSITION: Partial<Record<Involvement, string>> = {
  MENTIONED_ONLY:
    "Cette personne est mentionnée dans l'affaire, sans être ni mise en cause, ni poursuivie.",
  VICTIM: "Cette personne figure comme victime dans cette affaire. Elle n'est pas mise en cause.",
  PLAINTIFF:
    "Cette personne est à l'origine d'une plainte dans cette affaire. Elle n'est pas mise en cause.",
};

const REMINDER =
  "Les qualifications rappelées ci-dessus décrivent les faits reprochés dans l'affaire et ne la visent pas.";

export function getRoleNoticeCopy(involvement: Involvement): RoleNoticeCopy {
  return {
    roleLabel: INVOLVEMENT_LABELS[involvement],
    position:
      POSITION[involvement] ??
      "Cette personne n'est ni mise en cause, ni poursuivie dans cette affaire.",
    reminder: REMINDER,
  };
}
