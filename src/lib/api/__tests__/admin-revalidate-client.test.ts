import { describe, expect, it } from "vitest";
import { assertAllowedBase, extractSessionCookie } from "../admin-revalidate-client";

describe("assertAllowedBase", () => {
  it("accepte le domaine de production", () => {
    expect(assertAllowedBase("https://poligraph.fr")).toBe("https://poligraph.fr");
  });

  it.each([
    "http://poligraph.fr",
    "https://evil.example",
    "https://poligraph.fr.evil.example",
    "https://poligraph.fr:8443",
    "https://user@evil.example",
  ])("refuse %s", (base) => {
    expect(() => assertAllowedBase(base)).toThrow();
  });
});

describe("extractSessionCookie", () => {
  it("garde la paire nom=valeur sans les attributs", () => {
    expect(
      extractSessionCookie(["other=1; Path=/", "admin_session=abc.def; HttpOnly; Secure; Path=/"])
    ).toBe("admin_session=abc.def");
  });

  it("renvoie null sans cookie de session ou avec une valeur vide", () => {
    expect(extractSessionCookie(["other=1"])).toBeNull();
    expect(extractSessionCookie(["admin_session=; Max-Age=0"])).toBeNull();
  });
});
