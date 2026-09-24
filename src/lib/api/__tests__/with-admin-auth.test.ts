import { format } from "node:util";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  isAuthenticated: vi.fn(),
}));

import { withAdminAuth } from "../with-admin-auth";
import { isAuthenticated } from "@/lib/auth";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("withAdminAuth", () => {
  const mockRequest = new NextRequest("http://localhost/api/admin/test");
  const mockContext = { params: Promise.resolve({ id: "123" }) };

  it("returns 401 when not authenticated", async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(false);
    const handler = vi.fn();
    const wrapped = withAdminAuth(handler);
    const result = await wrapped(mockRequest, mockContext);
    const body = await result.json();
    expect(result.status).toBe(401);
    expect(body.error).toBe("Non autorisé");
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls handler when authenticated", async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(true);
    const { NextResponse } = await import("next/server");
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    const wrapped = withAdminAuth(handler);
    const result = await wrapped(mockRequest, mockContext);
    expect(handler).toHaveBeenCalledWith(mockRequest, mockContext);
    const body = await result.json();
    expect(body.ok).toBe(true);
  });

  it("catches errors and returns 500", async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(true);
    const handler = vi.fn().mockRejectedValue(new Error("DB down"));
    const wrapped = withAdminAuth(handler);
    const result = await wrapped(mockRequest, mockContext);
    const body = await result.json();
    expect(result.status).toBe(500);
    expect(body.error).toBe("Erreur interne");
  });
});

/**
 * Même défaut que sur le wrapper public : l'URL interpolée dans la chaîne de format fait
 * consommer l'erreur par un `%s` venu de la requête.
 */
describe("URL portant un spécificateur de format", () => {
  it("journalise l'erreur et l'URL telles quelles", async () => {
    vi.mocked(isAuthenticated).mockResolvedValue(true);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = new Error("la vraie erreur");
    const request = new NextRequest("http://localhost/api/admin/%s");

    await withAdminAuth(async () => {
      throw cause;
    })(request, { params: Promise.resolve({}) });

    expect(spy).toHaveBeenCalledTimes(1);
    const rendu = format(...(spy.mock.calls[0] as [unknown, ...unknown[]]));
    expect(rendu).toContain("la vraie erreur");
    expect(rendu).toContain("/api/admin/%s");
    spy.mockRestore();
  });
});
