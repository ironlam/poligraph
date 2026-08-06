import { z } from "zod/v4";

const VALID_POLITICAL_POSITIONS = [
  "FAR_LEFT",
  "LEFT",
  "CENTER_LEFT",
  "CENTER",
  "CENTER_RIGHT",
  "RIGHT",
  "FAR_RIGHT",
] as const;

const VALID_PARTY_ROLES = [
  "MEMBRE",
  "FONDATEUR",
  "PORTE_PAROLE",
  "COORDINATEUR",
  "PRESIDENT_HONNEUR",
  "SECRETAIRE_GENERAL",
] as const;

export const updatePartySchema = z.object({
  name: z.string().min(1).max(200),
  shortName: z.string().min(1).max(50),
  slug: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  foundedDate: z.string().nullable().optional(),
  dissolvedDate: z.string().nullable().optional(),
  politicalPosition: z.enum(VALID_POLITICAL_POSITIONS).nullable().optional(),
  politicalPositionSource: z.string().nullable().optional(),
  politicalPositionSourceUrl: z.string().nullable().optional(),
  politicalPositionOverride: z.boolean().optional(),
  ideology: z.string().nullable().optional(),
  headquarters: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  predecessorId: z.string().nullable().optional(),
});

export const addPartyMembershipSchema = z.object({
  partyId: z.string().min(1),
  startDate: z.string().optional(),
  role: z.enum(VALID_PARTY_ROLES).optional(),
});

export const createPartyMembershipSchema = z.object({
  mode: z.enum(["closed", "succeeds", "parallel"]),
  partyId: z.string().min(1),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  role: z.enum(VALID_PARTY_ROLES).nullable().optional(),
});

export const endPartyMembershipSchema = z.object({
  endDate: z.string().optional(),
});

export const updatePartyMembershipSchema = z.object({
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  role: z.enum(VALID_PARTY_ROLES).optional(),
});
