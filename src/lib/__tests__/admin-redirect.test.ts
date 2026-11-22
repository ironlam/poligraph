import { describe, expect, it } from "vitest";
import { safeAdminRedirect } from "../admin-redirect";

describe("safeAdminRedirect", () => {
  it("keeps admin paths with their query", () => {
    expect(safeAdminRedirect("/admin/oauth/autoriser?client_id=x")).toBe(
      "/admin/oauth/autoriser?client_id=x"
    );
  });

  it("falls back to /admin for anything that could leave the site or loop", () => {
    for (const next of [
      null,
      "",
      "/",
      "https://evil.example",
      "//evil.example",
      "/admin/\\evil",
      "/admin/login",
    ]) {
      expect(safeAdminRedirect(next)).toBe("/admin");
    }
  });
});
