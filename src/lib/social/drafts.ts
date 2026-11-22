import { db } from "@/lib/db";
import type { SocialPostStatus } from "@/generated/prisma";
import type { SocialCategory } from "./config";

/**
 * Drafts written from Claude through the MCP server. `content` carries the Bluesky text and
 * `twitterContent` the X text: the two networks get different writing, and an empty value means the
 * post does not go to that network. Rows written by the former generators have only `content`.
 */

export interface SocialDraftInput {
  category: SocialCategory;
  blueskyText?: string;
  xText?: string;
  entityId?: string;
}

export interface SocialPostSummary {
  id: string;
  category: string;
  status: SocialPostStatus;
  blueskyText: string | null;
  xText: string | null;
  blueskyUrl: string | null;
  twitterUrl: string | null;
  /** Last diagnostic per network, as stored (JSON). */
  blueskyError: string | null;
  twitterError: string | null;
  createdAt: string;
  postedAt: string | null;
}

const summarySelect = {
  id: true,
  category: true,
  status: true,
  content: true,
  twitterContent: true,
  blueskyUrl: true,
  twitterUrl: true,
  blueskyError: true,
  twitterError: true,
  createdAt: true,
  postedAt: true,
} as const;

type SummaryRow = {
  id: string;
  category: string;
  status: SocialPostStatus;
  content: string;
  twitterContent: string | null;
  blueskyUrl: string | null;
  twitterUrl: string | null;
  blueskyError: string | null;
  twitterError: string | null;
  createdAt: Date;
  postedAt: Date | null;
};

function toSummary(row: SummaryRow): SocialPostSummary {
  return {
    id: row.id,
    category: row.category,
    status: row.status,
    blueskyText: row.content.length > 0 ? row.content : null,
    xText: row.twitterContent,
    blueskyUrl: row.blueskyUrl,
    twitterUrl: row.twitterUrl,
    blueskyError: row.blueskyError,
    twitterError: row.twitterError,
    createdAt: row.createdAt.toISOString(),
    postedAt: row.postedAt?.toISOString() ?? null,
  };
}

export async function createSocialDraft(input: SocialDraftInput): Promise<SocialPostSummary> {
  const row = await db.socialPost.create({
    data: {
      category: input.category,
      content: input.blueskyText ?? "",
      twitterContent: input.xText ?? null,
      entityId: input.entityId ?? null,
      status: "PENDING_REVIEW",
    },
    select: summarySelect,
  });
  return toSummary(row);
}

export async function listSocialPosts(options: {
  status?: SocialPostStatus;
  limit: number;
}): Promise<SocialPostSummary[]> {
  const rows = await db.socialPost.findMany({
    where: options.status ? { status: options.status } : {},
    orderBy: { createdAt: "desc" },
    take: options.limit,
    select: summarySelect,
  });
  return rows.map(toSummary);
}

export async function rejectSocialPost(id: string): Promise<SocialPostSummary | null> {
  const existing = await db.socialPost.findUnique({ where: { id }, select: { status: true } });
  if (!existing || existing.status === "POSTED") return null;
  const row = await db.socialPost.update({
    where: { id },
    data: { status: "REJECTED" },
    select: summarySelect,
  });
  return toSummary(row);
}
