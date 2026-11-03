import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, buildSecurityHeaders } from "./security-headers";

describe("security headers", () => {
  it("autorise HelloAsso en frame-src", () => {
    expect(buildContentSecurityPolicy(false)).toContain(
      "frame-src 'self' https://www.helloasso.com"
    );
  });
  it("autorise youtube-nocookie en frame-src, sans youtube.com", () => {
    const csp = buildContentSecurityPolicy(false);
    expect(csp).toMatch(/frame-src[^;]*https:\/\/www\.youtube-nocookie\.com/);
    expect(csp).not.toMatch(/frame-src[^;]*https:\/\/www\.youtube\.com/);
  });
  it("a exactement une directive frame-ancestors 'none' sans source parasite", () => {
    const csp = buildContentSecurityPolicy(false);
    expect(csp.match(/frame-ancestors/g)).toHaveLength(1);
    expect(csp).toMatch(/frame-ancestors 'none'(;|$)/);
  });
  it("n'ajoute plus gateway.umami.is à default-src", () => {
    expect(buildContentSecurityPolicy(false)).toContain("default-src 'self';");
    expect(buildContentSecurityPolicy(false)).not.toMatch(/default-src 'self' https:\/\/gateway/);
  });
  it("garde gateway.umami.is en connect-src", () => {
    expect(buildContentSecurityPolicy(false)).toMatch(
      /connect-src[^;]*https:\/\/gateway\.umami\.is/
    );
  });
  it("ajoute 'unsafe-eval' seulement en dev", () => {
    expect(buildContentSecurityPolicy(true)).toContain("'unsafe-eval'");
    expect(buildContentSecurityPolicy(false)).not.toContain("'unsafe-eval'");
  });
  it("limite les workers aux ressources du site", () => {
    expect(buildContentSecurityPolicy(false)).toMatch(/worker-src 'self'(;|$)/);
    expect(buildContentSecurityPolicy(false)).not.toMatch(/worker-src[^;]*blob:/);
  });
  it("Permissions-Policy délègue payment à HelloAsso", () => {
    const pp = buildSecurityHeaders(false).find((h) => h.key === "Permissions-Policy");
    expect(pp!.value).toContain('payment=(self "https://www.helloasso.com")');
  });
});
