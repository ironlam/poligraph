import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLinearIssue } from "../linear";

const feedback = { id: "cfeedback1", category: "FACTUAL_ERROR" as const, pagePath: "/affaires" };

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, ...response });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("createLinearIssue", () => {
  beforeEach(() => {
    vi.stubEnv("LINEAR_API_KEY", "lin_api_test");
    vi.stubEnv("LINEAR_TEAM_ID", "team-uuid");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("ne fait aucun appel réseau quand Linear n'est pas configuré", async () => {
    vi.stubEnv("LINEAR_API_KEY", "");
    const fetchMock = mockFetch({});
    expect(await createLinearIssue(feedback)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("envoie la clé telle quelle, des variables GraphQL, et seulement des métadonnées", async () => {
    const fetchMock = mockFetch({
      json: async () => ({
        data: {
          issueCreate: { success: true, issue: { id: "i1", url: "https://linear.app/x/i1" } },
        },
      }),
    });

    const issue = await createLinearIssue(feedback);

    expect(issue).toEqual({ id: "i1", url: "https://linear.app/x/i1" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.linear.app/graphql");
    expect(init.headers.Authorization).toBe("lin_api_test");
    const body = JSON.parse(init.body);
    expect(body.variables.input.teamId).toBe("team-uuid");
    expect(body.variables.input.description).toContain("/admin/retours#cfeedback1");
    expect(body.query).not.toContain("cfeedback1");
  });

  it("renvoie null sur une réponse 200 qui porte des erreurs GraphQL", async () => {
    mockFetch({ json: async () => ({ errors: [{ message: "boom" }], data: null }) });
    expect(await createLinearIssue(feedback)).toBeNull();
  });

  it("renvoie null sur une erreur HTTP et sur une panne réseau, sans lever", async () => {
    mockFetch({ ok: false, status: 503 });
    expect(await createLinearIssue(feedback)).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    expect(await createLinearIssue(feedback)).toBeNull();
  });
});
