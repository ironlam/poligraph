import { describe, expect, it } from "vitest";
import { parseHelloAssoHeight } from "./helloasso-frame-utils";

const WIN = {} as unknown; // stand-in for iframe.contentWindow

describe("parseHelloAssoHeight", () => {
  const ok = { origin: "https://www.helloasso.com", source: WIN, data: { height: 800 } };
  it("accepte un message valide", () => {
    expect(parseHelloAssoHeight(ok, WIN)).toBe(800);
  });
  it("rejette une mauvaise origine", () => {
    expect(parseHelloAssoHeight({ ...ok, origin: "https://evil.com" }, WIN)).toBeNull();
  });
  it("rejette une mauvaise source", () => {
    expect(parseHelloAssoHeight(ok, {})).toBeNull();
  });
  it("rejette une hauteur non numérique", () => {
    expect(parseHelloAssoHeight({ ...ok, data: { height: "800" } }, WIN)).toBeNull();
  });
  it("rejette une hauteur négative ou démesurée", () => {
    expect(parseHelloAssoHeight({ ...ok, data: { height: -1 } }, WIN)).toBeNull();
    expect(parseHelloAssoHeight({ ...ok, data: { height: 999999 } }, WIN)).toBeNull();
  });
  it("rejette un data null", () => {
    expect(parseHelloAssoHeight({ ...ok, data: null }, WIN)).toBeNull();
  });
});
