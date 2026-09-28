import { describe, it, expect } from "vitest";
import {
  getDepartmentSvgPath,
  getDepartmentShapeDataUri,
  getDepartmentShapeWithDot,
  getDepartmentOutlinePath,
} from "../og-department-shape";

describe("getDepartmentSvgPath", () => {
  it("returns an SVG path string for a known department", () => {
    const path = getDepartmentSvgPath("75"); // Paris
    expect(path).toBeTruthy();
    expect(path).toMatch(/^M[\d.]+,[\d.]+L/);
    expect(path).toMatch(/Z$/);
  });

  it("returns null for unknown department code", () => {
    const path = getDepartmentSvgPath("99");
    expect(path).toBeNull();
  });
});

describe("getDepartmentShapeDataUri", () => {
  it("returns a base64 data URI for a valid department", () => {
    const uri = getDepartmentShapeDataUri("44", { width: 200, height: 200 });
    expect(uri).toBeTruthy();
    expect(uri).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it("returns null for unknown department", () => {
    const uri = getDepartmentShapeDataUri("99", { width: 200, height: 200 });
    expect(uri).toBeNull();
  });
});

describe("getDepartmentShapeWithDot", () => {
  it("returns data URI with dot for Nantes in Loire-Atlantique", () => {
    const uri = getDepartmentShapeWithDot("44", 47.2382, -1.5603, {
      width: 200,
      height: 200,
    });
    expect(uri).toBeTruthy();
    expect(uri).toMatch(/^data:image\/svg\+xml;base64,/);
    const base64 = uri!.split(",")[1]!;
    const svg = Buffer.from(base64, "base64").toString("utf-8");
    expect(svg).toContain("<circle");
    expect(svg).toContain('fill="#f97316"');
  });

  it("returns shape without dot when coordinates are null", () => {
    const uri = getDepartmentShapeWithDot("44", null, null, {
      width: 200,
      height: 200,
    });
    expect(uri).toBeTruthy();
    const base64 = uri!.split(",")[1]!;
    const svg = Buffer.from(base64, "base64").toString("utf-8");
    expect(svg).not.toContain("<circle");
  });
});

describe("getDepartmentOutlinePath", () => {
  it("n'écrit que des pixels entiers, sans point répété", () => {
    const path = getDepartmentOutlinePath("01")!;
    expect(path).toMatch(/^M\d+ \d+(L\d+ \d+)+Z$/);
    const points = path.slice(1, -1).split("L");
    points.slice(1).forEach((p, i) => expect(p).not.toBe(points[i]));
  });

  it("pèse bien moins que le tracé des images OG", () => {
    const outline = getDepartmentOutlinePath("29")!;
    const og = getDepartmentSvgPath("29", { width: 120, height: 120 })!;
    expect(outline.length).toBeLessThan(og.length / 2);
  });

  it("renvoie null pour une circonscription sans forme", () => {
    expect(getDepartmentOutlinePath("ZZ")).toBeNull();
  });
});
