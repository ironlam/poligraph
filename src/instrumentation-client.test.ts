import { beforeEach, describe, expect, it, vi } from "vitest";

type SentryEvent = {
  exception?: { values?: { type?: string; value?: string; stacktrace?: { frames?: unknown[] } }[] };
  fingerprint?: string[];
};

/** Builds an event whose stack sits in a React inline script, as Sentry receives it. */
function reactStreamingEvent(fn: string, value: string): SentryEvent {
  return {
    exception: {
      values: [
        {
          type: "TypeError",
          value,
          stacktrace: {
            frames: [
              { function: null, filename: "app:///affaires/condamnations", in_app: true },
              { function: fn, filename: "app:///affaires/condamnations", in_app: true },
            ],
          },
        },
      ],
    },
  };
}

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
  return (mocks.init.mock.calls[0]?.[0] ?? {}) as {
    integrations?: unknown[];
    beforeSend?: (event: SentryEvent) => SentryEvent | null;
  };
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

describe("Scripts de streaming React : bruit non actionnable", () => {
  // $RS/$RC/$RV sont les scripts inline que React injecte dans le HTML pour
  // révéler une frontière Suspense. Ils déréférencent getElementById sans
  // null-check : le nombre d'events égale le nombre de frontières de la page,
  // et aucun frame applicatif n'est en cause.
  it("regroupe la famille sous une empreinte unique", async () => {
    const { beforeSend } = await bootAt("/affaires/condamnations");
    const kept = beforeSend!(
      reactStreamingEvent("$RS", "Cannot read properties of null (reading 'parentNode')")
    );
    expect(kept).not.toBeNull();
    expect(kept!.fingerprint).toEqual(["react-streaming-reveal-script"]);
  });

  it("ne garde qu'un event par chargement de page", async () => {
    const { beforeSend } = await bootAt("/affaires/condamnations");
    const first = beforeSend!(
      reactStreamingEvent("$RS", "Cannot read properties of null (reading 'parentNode')")
    );
    const second = beforeSend!(
      reactStreamingEvent("$RS", "Cannot read properties of null (reading 'parentNode')")
    );
    const third = beforeSend!(
      reactStreamingEvent("$RC", "Cannot read properties of null (reading 'tagName')")
    );
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(third).toBeNull();
  });

  it("laisse passer une vraie erreur applicative qui touche parentNode", async () => {
    const { beforeSend } = await bootAt("/affaires/condamnations");
    const appError: SentryEvent = {
      exception: {
        values: [
          {
            type: "TypeError",
            value: "Cannot read properties of null (reading 'parentNode')",
            stacktrace: {
              frames: [
                {
                  function: "closeDropdown",
                  filename: "app:///_next/static/chunks/8409-8295dd6356804e56.js",
                  in_app: true,
                },
              ],
            },
          },
        ],
      },
    };
    const kept = beforeSend!(appError);
    expect(kept).toBe(appError);
    expect(kept!.fingerprint).toBeUndefined();
  });

  // POLIGRAPH-M est la cible réelle de l'investigation : la filtrer avec le
  // bruit qu'elle produit reviendrait à masquer la cause.
  it("laisse passer une erreur d'hydratation", async () => {
    const { beforeSend } = await bootAt("/");
    const hydration: SentryEvent = {
      exception: {
        values: [
          {
            type: "Error",
            value: "Hydration failed because the server rendered HTML didn't match the client.",
            stacktrace: { frames: [] },
          },
        ],
      },
    };
    expect(beforeSend!(hydration)).toBe(hydration);
  });
});

/** An event whose frames all sit in the document, the shape a browser-injected script produces. */
function injectedScriptEvent(frames: { function?: string; filename: string }[]): SentryEvent {
  return {
    exception: {
      values: [
        { type: "TypeError", value: "peu importe", stacktrace: { frames: frames as unknown[] } },
      ],
    },
  };
}

describe("Scripts injectés par le navigateur : une cause, une issue", () => {
  it("regroupe sous une empreinte unique quand aucune frame ne vient d'un chunk", async () => {
    const { beforeSend } = await bootAt("/");
    const event = injectedScriptEvent([
      { function: "Qk", filename: "app:///programmes" },
      { function: "Ok", filename: "app:///programmes" },
    ]);

    expect(beforeSend!(event)?.fingerprint).toEqual(["third-party-injected-script"]);
  });

  it("donne la même empreinte quelle que soit la page d'atterrissage", async () => {
    const { beforeSend } = await bootAt("/");
    // C'est tout l'intérêt : un script injecté garde l'URL du document où il a été injecté, donc
    // la même cause produisait cinq issues distinctes (POLIGRAPH-31 à 35).
    const depuisProgrammes = beforeSend!(
      injectedScriptEvent([{ function: "Qk", filename: "app:///programmes" }])
    );
    const depuisCandidats = beforeSend!(
      injectedScriptEvent([
        { function: "Qk", filename: "app:///elections/presidentielle-2027/candidats" },
      ])
    );

    expect(depuisProgrammes?.fingerprint).toEqual(depuisCandidats?.fingerprint);
  });

  it("laisse passer une vraie erreur applicative, qui vient toujours d'un chunk", async () => {
    const { beforeSend } = await bootAt("/");
    const applicative = injectedScriptEvent([
      { function: "onClick", filename: "app:///_next/static/chunks/app/page-abc123.js" },
      { function: "handler", filename: "app:///affaires/condamnations" },
    ]);

    expect(beforeSend!(applicative)).toBe(applicative);
  });

  it("ne touche pas à une exception sans frame", async () => {
    const { beforeSend } = await bootAt("/");
    // « Script error. » cross-origin : l'absence de frames ne prouve rien sur l'auteur du throw.
    const sansFrame = injectedScriptEvent([]);

    expect(beforeSend!(sansFrame)).toBe(sansFrame);
  });

  it("laisse la famille React de streaming à son propre traitement", async () => {
    const { beforeSend } = await bootAt("/");
    // Ses frames sont inline dans le document, donc elle matcherait aussi la forme « injectée ».
    const streaming = reactStreamingEvent("$RS", "parentNode est null");

    expect(beforeSend!(streaming)?.fingerprint).toEqual(["react-streaming-reveal-script"]);
  });
});
