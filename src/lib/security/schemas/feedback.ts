import { z } from "zod/v4";
import { FEEDBACK_CATEGORIES, FEEDBACK_MESSAGE_MAX, FEEDBACK_MESSAGE_MIN } from "@/config/feedback";
import { sanitizePagePath } from "@/lib/feedback/page-path";

export const feedbackSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES),
  message: z
    .string()
    .trim()
    .min(FEEDBACK_MESSAGE_MIN, "Le message est trop court")
    .max(FEEDBACK_MESSAGE_MAX, "Le message est trop long"),
  // Un chemin invalide est ignoré plutôt que refusé : le retour compte plus que sa provenance.
  pagePath: z.unknown().transform((value) => sanitizePagePath(value)),
  contactEmail: z
    .union([z.literal(""), z.email("Adresse e-mail invalide").max(254)])
    .optional()
    .transform((value) => (value ? value.toLowerCase() : null)),
  // Champ piège : invisible pour une personne, rempli par la plupart des robots.
  website: z.string().max(200).optional(),
});

export type FeedbackInput = z.infer<typeof feedbackSchema>;
