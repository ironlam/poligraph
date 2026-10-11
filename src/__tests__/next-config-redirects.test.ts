import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("redirections de compatibilité", () => {
  it("redirige les anciennes statistiques vers leurs pages dédiées", async () => {
    expect(nextConfig.redirects).toBeTypeOf("function");
    const redirects = await nextConfig.redirects!();

    expect(redirects).toEqual(
      expect.arrayContaining(
        [
          ["factchecks", "/statistiques/factchecks"],
          ["legislatif", "/statistiques/legislatif"],
          ["participation", "/statistiques/participation"],
        ].map(([tab, destination]) => ({
          source: "/statistiques",
          has: [{ type: "query", key: "tab", value: tab }],
          destination,
          permanent: true,
        }))
      )
    );
  });

  it("redirige durablement les anciennes pages sujets vers les pages thèmes", async () => {
    expect(nextConfig.redirects).toBeTypeOf("function");
    const redirects = await nextConfig.redirects!();

    expect(redirects).toContainEqual({
      source: "/elections/presidentielle-2027/sujets/:path*",
      destination: "/elections/presidentielle-2027/themes/:path*",
      permanent: true,
    });
  });

  it("redirige durablement la fiche fusionnée de Sabrina Agresti-Roubache", async () => {
    const redirects = await nextConfig.redirects!();

    expect(redirects).toContainEqual({
      source: "/politiques/sabrina-agresti-roubache",
      destination: "/politiques/sabrina-roubache",
      permanent: true,
    });
  });
});

// Mirrors how Next applies a redirect (server/lib/router-utils/resolve-routes.js): match the
// source, build the destination with the request query, derive the status code.
async function resolveRedirect(url: string) {
  const { getPathMatch } = await import("next/dist/shared/lib/router/utils/path-match");
  const { prepareDestination } =
    await import("next/dist/shared/lib/router/utils/prepare-destination");
  const { getRedirectStatus } = await import("next/dist/lib/redirect-status");
  const { pathname, searchParams } = new URL(url, "https://poligraph.fr");
  const query = Object.fromEntries(searchParams);
  for (const route of await nextConfig.redirects!()) {
    if ("has" in route && route.has) continue;
    const params = getPathMatch(route.source, { strict: true, removeUnnamedParams: true })(
      pathname
    );
    if (!params) continue;
    const { parsedDestination } = prepareDestination({
      appendParamsToQuery: false,
      destination: route.destination,
      params,
      query,
    });
    const search = new URLSearchParams(
      parsedDestination.query as Record<string, string>
    ).toString();
    return {
      location: `${parsedDestination.pathname}${search ? `?${search}` : ""}`,
      status: getRedirectStatus(route),
    };
  }
  return null;
}

describe("redirection des départements sous /territoires (#1052)", () => {
  it.each([
    ["/departements", "/territoires/departements"],
    ["/departements/ille-et-vilaine", "/territoires/departements/ille-et-vilaine"],
    [
      "/departements/ille-et-vilaine?lettre=B&page=2",
      "/territoires/departements/ille-et-vilaine?lettre=B&page=2",
    ],
    ["/departements/guyane/opengraph-image", "/territoires/departements/guyane/opengraph-image"],
    // An unknown slug is redirected as is, then 404s at the new address.
    ["/departements/n-existe-pas", "/territoires/departements/n-existe-pas"],
  ])("%s redirige en 308 vers %s", async (from, to) => {
    expect(await resolveRedirect(from)).toEqual({ location: to, status: 308 });
  });

  it("ne redirige pas les nouvelles adresses ni les départements des municipales", async () => {
    expect(await resolveRedirect("/territoires/departements/ille-et-vilaine")).toBeNull();
    expect(await resolveRedirect("/elections/municipales-2020/departements")).toBeNull();
  });
});
