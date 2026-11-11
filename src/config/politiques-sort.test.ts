import { describe, expect, it } from "vitest";
import {
  DEFAULT_POLITIQUES_SORT,
  POLITIQUES_SORT_OPTIONS,
  parsePolitiquesSort,
  politiquesSortParam,
} from "./politiques-sort";

describe("tri de /politiques", () => {
  it("n'omet de l'URL que le tri par défaut", () => {
    for (const sort of POLITIQUES_SORT_OPTIONS) {
      const param = politiquesSortParam(sort);
      if (sort === DEFAULT_POLITIQUES_SORT) expect(param).toBe("");
      else expect(param).toBe(sort);
    }
  });

  it("fait l'aller-retour URL -> tri pour chaque option", () => {
    for (const sort of POLITIQUES_SORT_OPTIONS) {
      expect(parsePolitiquesSort(politiquesSortParam(sort) || undefined)).toBe(sort);
    }
  });

  it("ramène une valeur inconnue ou retirée au tri par défaut", () => {
    expect(parsePolitiquesSort("dissidence")).toBe(DEFAULT_POLITIQUES_SORT);
    expect(parsePolitiquesSort(undefined)).toBe(DEFAULT_POLITIQUES_SORT);
    expect(politiquesSortParam("dissidence")).toBe("");
  });
});
