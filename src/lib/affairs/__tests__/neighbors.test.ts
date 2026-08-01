import { describe, it, expect } from "vitest";
import { pickNeighbors, type AffairNeighborRef } from "@/lib/affairs/neighbors";

const list: AffairNeighborRef[] = [
  { slug: "a", title: "Affaire A" },
  { slug: "b", title: "Affaire B" },
  { slug: "c", title: "Affaire C" },
];

describe("pickNeighbors", () => {
  it("returns both neighbours in the middle", () => {
    expect(pickNeighbors(list, "b")).toEqual({
      prev: { slug: "a", title: "Affaire A" },
      next: { slug: "c", title: "Affaire C" },
      position: 2,
      total: 3,
    });
  });

  it("has no prev at the first item", () => {
    const r = pickNeighbors(list, "a");
    expect(r.prev).toBeNull();
    expect(r.next).toEqual({ slug: "b", title: "Affaire B" });
    expect(r.position).toBe(1);
  });

  it("has no next at the last item", () => {
    const r = pickNeighbors(list, "c");
    expect(r.next).toBeNull();
    expect(r.prev).toEqual({ slug: "b", title: "Affaire B" });
    expect(r.position).toBe(3);
  });

  it("offers nothing when the affair is outside the perimeter", () => {
    expect(pickNeighbors(list, "z")).toEqual({
      prev: null,
      next: null,
      position: null,
      total: 3,
    });
  });

  it("handles a single-item perimeter", () => {
    const r = pickNeighbors([{ slug: "a", title: "Affaire A" }], "a");
    expect(r.prev).toBeNull();
    expect(r.next).toBeNull();
    expect(r.position).toBe(1);
    expect(r.total).toBe(1);
  });

  it("handles an empty perimeter", () => {
    expect(pickNeighbors([], "a")).toEqual({
      prev: null,
      next: null,
      position: null,
      total: 0,
    });
  });
});
