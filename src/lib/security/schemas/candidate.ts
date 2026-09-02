import { z } from "zod/v4";

// CSS hex colors only allow 3, 4, 6 or 8 hex digits. 5 or 7 are invalid.
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})$/;

const SLOGAN_MAX = 200;
const WITHDREW_REASON_MAX = 1000;
const NOTES_MAX = 2000;
const RANK_MAX = 999;
const SOURCE_LABEL_MAX = 300;
const SYNTHESIS_MAX = 5_000;

export const createCandidatePresidentialSchema = z.object({
  candidacyId: z.string().min(1),
  slogan: z.string().max(SLOGAN_MAX).optional(),
  accentColor: z.string().regex(HEX_COLOR_RE).optional(),
  declaredAt: z.string().datetime().optional(),
  withdrewAt: z.string().datetime().optional(),
  withdrewReason: z.string().max(WITHDREW_REASON_MAX).optional(),
  rank: z.number().int().min(0).max(RANK_MAX).optional(),
  notes: z.string().max(NOTES_MAX).optional(),
});

export const updateCandidatePresidentialSchema = z.object({
  slogan: z.string().max(SLOGAN_MAX).nullable().optional(),
  accentColor: z.string().regex(HEX_COLOR_RE).nullable().optional(),
  declaredAt: z.string().datetime().nullable().optional(),
  withdrewAt: z.string().datetime().nullable().optional(),
  withdrewReason: z.string().max(WITHDREW_REASON_MAX).nullable().optional(),
  rank: z.number().int().min(0).max(RANK_MAX).nullable().optional(),
  notes: z.string().max(NOTES_MAX).nullable().optional(),
  publicationStatus: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED", "EXCLUDED", "REJECTED"]).optional(),
});

export const reviewCandidateSynthesisSchema = z
  .object({ synthesis: z.string().trim().min(20).max(SYNTHESIS_MAX) })
  .strict();

// Schéma combiné pour POST /api/admin/candidats : crée la Candidacy (via picker)
// ET les métadonnées CandidacyPresidential dans une seule transaction.
//
// La source (sourceUrl + sourceLabel) est exigée quand le statut est DECLARE (#660, décisions du
// 2026-08-06) : une candidature déclarée est sourcée. Elle reste facultative pour les autres statuts,
// qui servent au suivi éditorial.
export const createCandidacyPresidentialFromPickerSchema = z
  .object({
    politicianId: z.string().min(1),
    electionSlug: z.string().min(1),
    status: z.enum(["DECLARE", "PRESSENTI", "ENVISAGE", "RETIRE"]).default("PRESSENTI"),
    sourceUrl: z.string().url().optional(),
    sourceLabel: z.string().min(1).max(SOURCE_LABEL_MAX).optional(),
    slogan: z.string().max(SLOGAN_MAX).optional(),
    accentColor: z.string().regex(HEX_COLOR_RE).optional(),
    declaredAt: z.string().datetime().optional(),
    withdrewAt: z.string().datetime().optional(),
    withdrewReason: z.string().max(WITHDREW_REASON_MAX).optional(),
    rank: z.number().int().min(0).max(RANK_MAX).optional(),
    notes: z.string().max(NOTES_MAX).optional(),
  })
  .refine(
    (data) => data.status !== "DECLARE" || (Boolean(data.sourceUrl) && Boolean(data.sourceLabel)),
    {
      message: "Une candidature déclarée exige une source : URL et libellé.",
      path: ["sourceUrl"],
    }
  );
