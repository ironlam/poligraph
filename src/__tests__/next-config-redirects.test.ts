import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("redirections de compatibilité", () => {
  it("redirige durablement les anciennes pages sujets vers les pages thèmes", async () => {
    expect(nextConfig.redirects).toBeTypeOf("function");
    const redirects = await nextConfig.redirects!();

    expect(redirects).toContainEqual({
      source: "/elections/presidentielle-2027/sujets/:path*",
      destination: "/elections/presidentielle-2027/themes/:path*",
      permanent: true,
    });
  });
});
