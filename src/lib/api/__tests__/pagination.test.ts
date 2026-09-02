import { describe, it, expect } from "vitest";
import { parsePagination, parseStrictPagination } from "../pagination";

describe("parsePagination", () => {
  it("uses defaults when no params", () => {
    const params = new URLSearchParams();
    expect(parsePagination(params)).toEqual({ page: 1, limit: 50, skip: 0 });
  });

  it("parses valid page and limit", () => {
    const params = new URLSearchParams({ page: "3", limit: "20" });
    expect(parsePagination(params)).toEqual({ page: 3, limit: 20, skip: 40 });
  });

  it("clamps page to minimum 1", () => {
    const params = new URLSearchParams({ page: "-5" });
    expect(parsePagination(params).page).toBe(1);
  });

  it("clamps limit to maximum 100", () => {
    const params = new URLSearchParams({ limit: "500" });
    expect(parsePagination(params).limit).toBe(100);
  });

  it("clamps limit to minimum 1", () => {
    const params = new URLSearchParams({ limit: "0" });
    expect(parsePagination(params).limit).toBe(1);
  });

  it("accepts custom default limit", () => {
    const params = new URLSearchParams();
    expect(parsePagination(params, { defaultLimit: 20 }).limit).toBe(20);
  });

  it("accepts custom max limit", () => {
    const params = new URLSearchParams({ limit: "200" });
    expect(parsePagination(params, { maxLimit: 200 }).limit).toBe(200);
  });

  it("handles NaN gracefully", () => {
    const params = new URLSearchParams({ page: "abc", limit: "xyz" });
    expect(parsePagination(params)).toEqual({ page: 1, limit: 50, skip: 0 });
  });
});

describe("parseStrictPagination", () => {
  it("applique les valeurs par défaut et calcule le décalage", () => {
    expect(parseStrictPagination(new URLSearchParams(), { defaultLimit: 20 })).toEqual({
      page: 1,
      limit: 20,
      skip: 0,
    });
    expect(
      parseStrictPagination(new URLSearchParams({ page: "3", limit: "20" }), {
        defaultLimit: 20,
      })
    ).toEqual({ page: 3, limit: 20, skip: 40 });
  });

  it.each([
    "page=0",
    "page=1.5",
    "page=abc",
    "page=9007199254740992",
    "limit=0",
    "limit=1.5",
    "limit=101",
  ])("refuse une pagination malformée ou hors bornes : %s", (query) => {
    expect(
      parseStrictPagination(new URLSearchParams(query), { defaultLimit: 20, maxLimit: 100 })
    ).toBeNull();
  });

  it("respecte une borne explicite sur le numéro de page", () => {
    expect(
      parseStrictPagination(new URLSearchParams({ page: "10001" }), {
        defaultLimit: 20,
        maxLimit: 20,
        maxPage: 10_000,
      })
    ).toBeNull();
  });
});
