import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  replayIntegration: vi.fn(() => ({ name: "Replay" })),
  captureRouterTransitionStart: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  init: mocks.init,
  replayIntegration: mocks.replayIntegration,
  captureRouterTransitionStart: mocks.captureRouterTransitionStart,
}));

/** Boots the client instrumentation as if the document had loaded at `pathname`. */
async function bootAt(pathname: string) {
  vi.resetModules();
  mocks.init.mockClear();
  mocks.replayIntegration.mockClear();
  window.history.replaceState(null, "", pathname);
  await import("./instrumentation-client");
  return (mocks.init.mock.calls[0]?.[0] ?? {}) as { integrations?: unknown[] };
}

const hasReplay = (opts: { integrations?: unknown[] }) =>
  (opts.integrations ?? []).some((i) => (i as { name?: string })?.name === "Replay");

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@o1.ingest.de.sentry.io/1");
  vi.stubEnv("NEXT_PUBLIC_SENTRY_ENABLED", "true");
});

describe("Session replay : périmètre d'enregistrement", () => {
  it("enregistre sur les pages publiques", async () => {
    expect(hasReplay(await bootAt("/elections/presidentielle-2027/themes/economie-budget"))).toBe(
      true
    );
    expect(hasReplay(await bootAt("/"))).toBe(true);
    expect(hasReplay(await bootAt("/statistiques"))).toBe(true);
  });

  // Les écrans de modération affichent des affaires non publiées, donc des données
  // d'infractions rattachées à des personnes nommées (RGPD art. 10). Le replay
  // enregistre le texte en clair (maskAllText: false) : il n'a rien à y faire.
  it("n'enregistre jamais dans l'admin", async () => {
    expect(hasReplay(await bootAt("/admin"))).toBe(false);
    expect(hasReplay(await bootAt("/admin/affaires"))).toBe(false);
    expect(hasReplay(await bootAt("/admin/affaires/123/edit"))).toBe(false);
    expect(hasReplay(await bootAt("/admin/policy-titles?status=PENDING"))).toBe(false);
  });

  it("continue de remonter les erreurs dans l'admin, sans replay", async () => {
    const opts = await bootAt("/admin/affaires");
    expect(mocks.init).toHaveBeenCalledTimes(1);
    expect(hasReplay(opts)).toBe(false);
  });

  it("ne coupe pas une route publique dont le nom commence par admin", async () => {
    expect(hasReplay(await bootAt("/administration-publique"))).toBe(true);
  });
});
