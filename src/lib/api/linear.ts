import { FEEDBACK_CATEGORY_LABELS, type FeedbackCategoryKey } from "@/config/feedback";
import { SITE_URL } from "@/config/site";

const LINEAR_ENDPOINT = "https://api.linear.app/graphql";
const TIMEOUT_MS = 5000;

const ISSUE_CREATE = `
  mutation IssueCreate($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue { id url }
    }
  }
`;

export interface LinearIssue {
  id: string;
  url: string;
}

/**
 * Crée l'issue Linear d'un retour de visiteur. Ne reçoit JAMAIS le message ni l'e-mail : le
 * message peut citer des tiers, il reste en base et l'issue renvoie vers l'admin.
 *
 * Renvoie null quand Linear n'est pas configuré ou ne répond pas : le retour est déjà enregistré,
 * l'échec de Linear ne doit pas le perdre.
 */
export async function createLinearIssue(feedback: {
  id: string;
  category: FeedbackCategoryKey;
  pagePath: string | null;
}): Promise<LinearIssue | null> {
  const apiKey = process.env.LINEAR_API_KEY;
  const teamId = process.env.LINEAR_TEAM_ID;
  if (!apiKey || !teamId) return null;

  const label = FEEDBACK_CATEGORY_LABELS[feedback.category];
  const input = {
    teamId,
    title: `Retour visiteur : ${label}${feedback.pagePath ? ` (${feedback.pagePath})` : ""}`,
    description: `Catégorie : ${label}\nPage : ${feedback.pagePath ?? "non précisée"}\n\nMessage complet dans l'admin : ${SITE_URL}/admin/retours#${feedback.id}`,
  };

  try {
    const response = await fetch(LINEAR_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: apiKey },
      body: JSON.stringify({ query: ISSUE_CREATE, variables: { input } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error("[Feedback] Linear a répondu", response.status);
      return null;
    }
    const json = (await response.json()) as {
      errors?: unknown[];
      data?: { issueCreate?: { success?: boolean; issue?: LinearIssue } };
    };
    // Linear peut répondre 200 avec une erreur dans `errors`.
    const issue = json.data?.issueCreate?.issue;
    if (json.errors?.length || !json.data?.issueCreate?.success || !issue) {
      console.error("[Feedback] Linear a refusé la création de l'issue");
      return null;
    }
    return { id: issue.id, url: issue.url };
  } catch (error) {
    console.error("[Feedback] Échec de l'appel à Linear :", error);
    return null;
  }
}
