import { beforeEach, describe, expect, it } from "vitest";
import { signSessionToken, verifySessionToken } from "@/lib/auth-token";
import { hasValidAdminSession } from "../proxy";

/**
 * The admin session guard of `src/proxy.ts` (issue #647).
 *
 * Built violation first, and the violation is the one that was live: the proxy checked
 * `session?.value`, so `admin_session=1` passed it. Only four admin pages out of thirty-seven called
 * `isAuthenticated()` themselves, so the rest rendered for anyone who set any cookie.
 *
 * Note for the record: the earlier reading of this issue said there was no middleware at all. That was
 * literally true of `middleware.ts` and wrong in substance, because Next 16 renamed the convention to
 * `proxy.ts` and this repository has one.
 */

const PASSWORD = "mot-de-passe-de-test";
const SESSION_SECRET = "session-secret-for-admin-guard-tests-only";

function requestWith(cookie?: string) {
  return {
    cookies: {
      get: (name: string) =>
        name === "admin_session" && cookie !== undefined ? { name, value: cookie } : undefined,
    },
  } as unknown as Parameters<typeof hasValidAdminSession>[0];
}

describe("hasValidAdminSession", () => {
  beforeEach(() => {
    process.env.ADMIN_PASSWORD = PASSWORD;
    process.env.ADMIN_SESSION_SECRET = SESSION_SECRET;
    process.env.ADMIN_SESSION_KEY_ID = "guard-test-key";
    process.env.ADMIN_SESSION_EPOCH = "1";
  });

  it("refuse un cookie posé à la main, qui passait avant", () => {
    expect(hasValidAdminSession(requestWith("1"))).toBe(false);
  });

  it("refuse une signature inventée", () => {
    const token = `${Date.now()}.0000000000000000000000000000000000000000000000000000000000000000`;

    expect(hasValidAdminSession(requestWith(token))).toBe(false);
  });

  it("ne couple pas un jeton au mot de passe", () => {
    const token = signSessionToken(Date.now());
    process.env.ADMIN_PASSWORD = "un-autre-mot-de-passe";

    expect(hasValidAdminSession(requestWith(token))).toBe(true);
  });

  it("refuse un jeton expiré", () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;

    expect(hasValidAdminSession(requestWith(signSessionToken(eightDaysAgo)))).toBe(false);
  });

  it("refuse l'absence de cookie", () => {
    expect(hasValidAdminSession(requestWith())).toBe(false);
  });

  it("accepte un jeton que nous avons signé", () => {
    // Sans ce cas, une garde qui refuse tout passerait les cinq tests ci-dessus en rendant l'admin
    // inutilisable.
    expect(hasValidAdminSession(requestWith(signSessionToken(Date.now())))).toBe(true);
  });
});

describe("verifySessionToken : les formes dégénérées", () => {
  beforeEach(() => {
    process.env.ADMIN_PASSWORD = PASSWORD;
    process.env.ADMIN_SESSION_SECRET = SESSION_SECRET;
    process.env.ADMIN_SESSION_KEY_ID = "guard-test-key";
    process.env.ADMIN_SESSION_EPOCH = "1";
  });

  it.each(["", ".", "sans-point", "12345", `${Date.now()}.`, ".signature-seule"])(
    "refuse %o",
    (token) => {
      expect(verifySessionToken(token)).toBe(false);
    }
  );

  it("refuse tout quand le secret de session est absent", () => {
    // Sinon une instance mal configurée signerait et vérifierait avec la clé vide, donc accepterait
    // un jeton que n'importe qui peut calculer.
    const token = signSessionToken(Date.now());
    delete process.env.ADMIN_SESSION_SECRET;

    expect(verifySessionToken(token)).toBe(false);
  });
});
