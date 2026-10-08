import type { Prisma } from "@/generated/prisma";

/** Filtre de toute lecture publique des étapes : seules les étapes publiées sortent. */
export const PUBLIC_EVENT_WHERE = {
  status: "PUBLISHED",
} as const satisfies Prisma.AffairEventWhereInput;
