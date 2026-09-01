import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  authenticated: vi.fn(),
  generate: vi.fn(),
  publish: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ isAuthenticated: h.authenticated }));
vi.mock("@/services/candidacy-theme-synthesis/generation", () => ({
  generateCandidacyThemeSynthesis: h.generate,
}));
vi.mock("@/lib/presidentielle/candidacy-theme-synthesis-review", () => ({
  publishCandidacyThemeSynthesis: h.publish,
}));
vi.mock("@/lib/presidentielle/candidacy-cache", () => ({
  invalidatePresidentialCandidacyTags: h.invalidate,
}));

import { POST as generatePost } from "../generate/route";
import { POST as publishPost } from "../publish/route";

const context = { params: Promise.resolve({ id: "candidacy-1" }) } as unknown as Parameters<
  typeof generatePost
>[1];

function request(path: string, body: unknown) {
  return new Request(`https://poligraph.fr${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "route-test" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof generatePost>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  h.authenticated.mockResolvedValue(true);
  h.generate.mockResolvedValue({
    ok: true,
    text: "Synthèse étayée.",
    claims: [],
    corpusFingerprint: "a".repeat(64),
    electionId: "election-1",
    measureCount: 2,
    model: "mistral-large-latest",
    persisted: false,
  });
  h.publish.mockResolvedValue({ ok: true, electionId: "election-1" });
});

describe("routes admin des synthèses thématiques", () => {
  it("protège la prévisualisation et la laisse strictement sans persistance", async () => {
    const response = await generatePost(
      request("/api/admin/candidats/candidacy-1/theme-syntheses/generate", {
        theme: "SANTE",
        persist: false,
      }),
      context
    );

    expect(response.status).toBe(200);
    expect(h.authenticated).toHaveBeenCalled();
    expect(h.generate).toHaveBeenCalledWith(
      "candidacy-1",
      "SANTE",
      expect.objectContaining({ persist: false })
    );
    expect(h.invalidate).not.toHaveBeenCalled();
  });

  it("invalide le cache ciblé après la création d'un brouillon", async () => {
    h.generate.mockResolvedValue({
      ok: true,
      text: "Synthèse étayée.",
      claims: [],
      corpusFingerprint: "a".repeat(64),
      electionId: "election-1",
      measureCount: 2,
      model: "mistral-large-latest",
      persisted: true,
    });

    await generatePost(
      request("/api/admin/candidats/candidacy-1/theme-syntheses/generate", {
        theme: "SANTE",
        persist: true,
      }),
      context
    );

    expect(h.invalidate).toHaveBeenCalledWith("election-1");
  });

  it("rejette un thème hors taxonomie avant le service", async () => {
    const response = await generatePost(
      request("/api/admin/candidats/candidacy-1/theme-syntheses/generate", {
        theme: "THEME_INVENTE",
        persist: false,
      }),
      context
    );

    expect(response.status).toBe(400);
    expect(h.generate).not.toHaveBeenCalled();
  });

  it("publie uniquement avec une empreinte valide et l'identifiant du chemin", async () => {
    const response = await publishPost(
      request("/api/admin/candidats/candidacy-1/theme-syntheses/publish", {
        synthesisId: "synthesis-1",
        corpusFingerprint: "b".repeat(64),
        contentFingerprint: "c".repeat(64),
      }),
      context
    );

    expect(response.status).toBe(200);
    expect(h.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        candidacyId: "candidacy-1",
        synthesisId: "synthesis-1",
        expectedCorpusFingerprint: "b".repeat(64),
        expectedContentFingerprint: "c".repeat(64),
      })
    );
    expect(h.invalidate).toHaveBeenCalledWith("election-1");
  });

  it("rejette une empreinte invalide avant la publication", async () => {
    const response = await publishPost(
      request("/api/admin/candidats/candidacy-1/theme-syntheses/publish", {
        synthesisId: "synthesis-1",
        corpusFingerprint: "invalide",
        contentFingerprint: "c".repeat(64),
      }),
      context
    );

    expect(response.status).toBe(400);
    expect(h.publish).not.toHaveBeenCalled();
  });
});
