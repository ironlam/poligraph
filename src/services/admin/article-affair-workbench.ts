import { createHash } from "node:crypto";
import type { Prisma, PressAffairRole } from "@/generated/prisma";
import { db } from "@/lib/db";
import { significantTitleWords, titlesShareVocabulary } from "@/services/affairs/matching";

export const ARTICLE_AFFAIR_ROLES = ["REVELATION", "UPDATE", "MENTION"] as const;
export type ArticleAffairRole = (typeof ARTICLE_AFFAIR_ROLES)[number];

export type ArticleRelationSnapshot = {
  articleVersion: string;
  relationsHash: string;
};

export class RelationshipConflictError extends Error {
  constructor(message = "La relation a changé. Rechargez la page avant de recommencer.") {
    super(message);
    this.name = "RelationshipConflictError";
  }
}

export function hashArticleRelations(
  relations: Array<{ id: string; affairId: string; role: PressAffairRole }>
): string {
  const payload = relations
    .map(({ id, affairId, role }) => `${id}:${affairId}:${role}`)
    .sort()
    .join("|");
  return createHash("sha256").update(payload).digest("hex");
}

function snapshot(
  articleVersion: Date,
  relations: Array<{ id: string; affairId: string; role: PressAffairRole }>
): ArticleRelationSnapshot {
  return {
    articleVersion: articleVersion.toISOString(),
    relationsHash: hashArticleRelations(relations),
  };
}

const articleSelect = {
  id: true,
  title: true,
  description: true,
  aiSummary: true,
  url: true,
  feedSource: true,
  publishedAt: true,
  aiAnalyzedAt: true,
  isAffairRelated: true,
  createdAt: true,
  _count: { select: { mentions: true, affairLinks: true } },
  mentions: {
    select: {
      politician: { select: { id: true, fullName: true, slug: true } },
      matchedName: true,
    },
  },
  affairLinks: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      affairId: true,
      role: true,
      createdAt: true,
      affair: {
        select: {
          id: true,
          title: true,
          slug: true,
          publicationStatus: true,
          status: true,
          politician: { select: { id: true, fullName: true, slug: true } },
          sources: {
            select: { id: true, url: true, title: true, publisher: true },
          },
        },
      },
    },
  },
} satisfies Prisma.PressArticleSelect;

export type ArticleWorkbench = Prisma.PressArticleGetPayload<{ select: typeof articleSelect }> & {
  snapshot: ArticleRelationSnapshot;
  suggestions: Array<{
    affair: {
      id: string;
      title: string;
      slug: string;
      publicationStatus: string;
      politician: { id: string; fullName: string; slug: string };
    };
    reasons: string[];
  }>;
};

export async function getArticleWorkbench(articleId: string): Promise<ArticleWorkbench | null> {
  const article = await db.pressArticle.findUnique({
    where: { id: articleId },
    select: articleSelect,
  });
  if (!article) return null;

  const mentionedPoliticianIds = article.mentions.map((mention) => mention.politician.id);
  const titleTerm = [...significantTitleWords(article.title)][0];
  const candidates = await db.affair.findMany({
    where: {
      id: { notIn: article.affairLinks.map((link) => link.affairId) },
      OR: [
        ...(mentionedPoliticianIds.length > 0
          ? [{ politicianId: { in: mentionedPoliticianIds } }]
          : []),
        { sources: { some: { url: article.url } } },
        ...(titleTerm ? [{ title: { contains: titleTerm, mode: "insensitive" as const } }] : []),
      ],
    },
    select: {
      id: true,
      title: true,
      slug: true,
      publicationStatus: true,
      politician: { select: { id: true, fullName: true, slug: true } },
      sources: { select: { url: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  const suggestions = candidates
    .map((affair) => {
      const reasons: string[] = [];
      if (mentionedPoliticianIds.includes(affair.politician.id)) {
        reasons.push("même personnalité mentionnée");
      }
      if (affair.sources.some((source) => source.url === article.url)) {
        reasons.push("l’URL existe déjà comme source");
      }
      if (titlesShareVocabulary(article.title, affair.title)) reasons.push("titre proche");
      return { affair, reasons };
    })
    .filter((candidate) => candidate.reasons.length > 0);

  const relationRows = article.affairLinks.map(({ id, affairId, role }) => ({
    id,
    affairId,
    role,
  }));
  return { ...article, snapshot: snapshot(article.createdAt, relationRows), suggestions };
}

type ArticleSnapshotRow = {
  createdAt: Date;
  affairLinks: Array<{ id: string; affairId: string; role: PressAffairRole }>;
};

async function assertArticleSnapshot(
  findArticle: (articleId: string) => Promise<ArticleSnapshotRow | null>,
  articleId: string,
  expected: ArticleRelationSnapshot
) {
  const article = await findArticle(articleId);
  if (!article) throw new Error("ARTICLE_NOT_FOUND");
  const current = snapshot(article.createdAt, article.affairLinks);
  if (
    current.articleVersion !== expected.articleVersion ||
    current.relationsHash !== expected.relationsHash
  ) {
    throw new RelationshipConflictError();
  }
  return article;
}

export async function mutateArticleAffairRelation(input: {
  operation: "LINK" | "CHANGE" | "REMOVE";
  articleId: string;
  affairId?: string;
  oldAffairId?: string;
  role?: ArticleAffairRole;
  addSource?: boolean;
  justification: string;
  expected: ArticleRelationSnapshot;
}) {
  try {
    const result = await db.$transaction(async (tx) => {
      const article = await assertArticleSnapshot(
        (articleId) =>
          tx.pressArticle.findUnique({
            where: { id: articleId },
            select: {
              createdAt: true,
              affairLinks: { select: { id: true, affairId: true, role: true } },
            },
          }),
        input.articleId,
        input.expected
      );
      const currentLinks = article.affairLinks;
      const sourceArticle = await tx.pressArticle.findUnique({
        where: { id: input.articleId },
        select: { title: true, url: true, feedSource: true, publishedAt: true },
      });
      if (!sourceArticle) throw new Error("ARTICLE_NOT_FOUND");

      if (input.operation === "REMOVE") {
        if (!input.oldAffairId) throw new Error("RELATION_REQUIRED");
        const relation = currentLinks.find((link) => link.affairId === input.oldAffairId);
        if (!relation) throw new RelationshipConflictError("Cette liaison n’existe plus.");
        await tx.pressArticleAffair.delete({ where: { id: relation.id } });
        await tx.auditLog.create({
          data: {
            action: "RELATIONSHIP_REMOVED",
            entityType: "PressArticleAffair",
            entityId: relation.id,
            changes: {
              operation: "REMOVE",
              articleId: input.articleId,
              affairId: input.oldAffairId,
              justification: input.justification,
            },
          },
        });
        return { relationId: relation.id, operation: input.operation };
      }

      if (!input.affairId || !input.role) throw new Error("TARGET_RELATION_REQUIRED");
      const affair = await tx.affair.findUnique({
        where: { id: input.affairId },
        select: { id: true },
      });
      if (!affair) throw new Error("AFFAIR_NOT_FOUND");

      if (input.operation === "LINK") {
        const existing = await tx.pressArticleAffair.findUnique({
          where: { articleId_affairId: { articleId: input.articleId, affairId: input.affairId } },
        });
        if (existing) {
          if (existing.role === input.role)
            return { relationId: existing.id, operation: "NOOP" as const };
          throw new RelationshipConflictError("Cette affaire est déjà liée avec un autre rôle.");
        }
        const relation = await tx.pressArticleAffair.create({
          data: { articleId: input.articleId, affairId: input.affairId, role: input.role },
        });
        if (input.addSource) {
          await tx.source.upsert({
            where: { affairId_url: { affairId: input.affairId, url: sourceArticle.url } },
            create: {
              affairId: input.affairId,
              url: sourceArticle.url,
              title: sourceArticle.title,
              publisher: sourceArticle.feedSource,
              publishedAt: sourceArticle.publishedAt,
              sourceType: "PRESSE",
            },
            update: {},
          });
        }
        await tx.auditLog.create({
          data: {
            action: "RELATIONSHIP_LINKED",
            entityType: "PressArticleAffair",
            entityId: relation.id,
            changes: {
              operation: "LINK",
              articleId: input.articleId,
              affairId: input.affairId,
              role: input.role,
              addSource: Boolean(input.addSource),
              justification: input.justification,
            },
          },
        });
        return { relationId: relation.id, operation: input.operation };
      }

      if (!input.oldAffairId || input.oldAffairId === input.affairId) {
        throw new Error("CHANGE_TARGET_REQUIRED");
      }
      const oldRelation = currentLinks.find((link) => link.affairId === input.oldAffairId);
      if (!oldRelation) throw new RelationshipConflictError("La liaison à déplacer n’existe plus.");
      const targetExists = await tx.pressArticleAffair.findUnique({
        where: { articleId_affairId: { articleId: input.articleId, affairId: input.affairId } },
        select: { id: true },
      });
      if (targetExists)
        throw new RelationshipConflictError("La nouvelle affaire est déjà liée à cet article.");
      const replacement = await tx.pressArticleAffair.create({
        data: { articleId: input.articleId, affairId: input.affairId, role: input.role },
      });
      await tx.pressArticleAffair.delete({ where: { id: oldRelation.id } });
      await tx.auditLog.create({
        data: {
          action: "RELATIONSHIP_CHANGED",
          entityType: "PressArticleAffair",
          entityId: replacement.id,
          changes: {
            operation: "CHANGE",
            articleId: input.articleId,
            oldAffairId: input.oldAffairId,
            newAffairId: input.affairId,
            role: input.role,
            justification: input.justification,
            oldSourcePreserved: true,
          },
        },
      });
      return { relationId: replacement.id, operation: input.operation };
    });
    return result;
  } catch (error) {
    if (error instanceof RelationshipConflictError) throw error;
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      throw new RelationshipConflictError("Cette relation existe déjà. Rechargez le contexte.");
    }
    if (
      error instanceof Error &&
      ["ARTICLE_NOT_FOUND", "AFFAIR_NOT_FOUND"].includes(error.message)
    ) {
      throw error;
    }
    throw error;
  }
}
