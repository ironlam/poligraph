import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { withValidation } from "@/lib/security/validate";
import {
  getArticleWorkbench,
  mutateArticleAffairRelation,
  ARTICLE_AFFAIR_ROLES,
  RelationshipConflictError,
} from "@/services/admin/article-affair-workbench";

const operationSchema = z.object({
  operation: z.enum(["LINK", "CHANGE", "REMOVE"]),
  articleId: z.string().min(1).max(100),
  affairId: z.string().max(100).optional(),
  oldAffairId: z.string().max(100).optional(),
  role: z.enum(ARTICLE_AFFAIR_ROLES).optional(),
  addSource: z.boolean().default(false),
  justification: z.string().trim().min(20).max(2000),
  expected: z.object({
    articleVersion: z.string().datetime(),
    relationsHash: z.string().length(64),
  }),
});

export const GET = withAdminAuth(async (request: NextRequest) => {
  const articleId = new URL(request.url).searchParams.get("articleId");
  if (!articleId || articleId.length > 100) {
    return NextResponse.json({ error: "Article requis" }, { status: 400 });
  }
  const workbench = await getArticleWorkbench(articleId);
  if (!workbench) return NextResponse.json({ error: "Article introuvable" }, { status: 404 });
  return NextResponse.json(workbench);
});

export const POST = withAdminAuth(
  withValidation(operationSchema, async (_request, _context, body) => {
    try {
      const result = await mutateArticleAffairRelation(body);
      return NextResponse.json(result);
    } catch (error) {
      if (error instanceof RelationshipConflictError) {
        return NextResponse.json(
          { error: error.message, code: "RELATIONSHIP_CONFLICT" },
          { status: 409 }
        );
      }
      if (error instanceof Error && error.message === "ARTICLE_NOT_FOUND") {
        return NextResponse.json({ error: "Article introuvable" }, { status: 404 });
      }
      if (error instanceof Error && error.message === "AFFAIR_NOT_FOUND") {
        return NextResponse.json({ error: "Affaire introuvable" }, { status: 404 });
      }
      if (
        error instanceof Error &&
        ["RELATION_REQUIRED", "TARGET_RELATION_REQUIRED", "CHANGE_TARGET_REQUIRED"].includes(
          error.message
        )
      ) {
        return NextResponse.json({ error: "Relation incomplète" }, { status: 400 });
      }
      throw error;
    }
  })
);
