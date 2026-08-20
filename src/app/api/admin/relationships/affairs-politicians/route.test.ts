import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ context: vi.fn(), reassign: vi.fn() }));
vi.mock("@/services/admin/affair-politician-workbench", () => ({
  getAffairReassignmentContext: h.context,
  reassignAffairPolitician: h.reassign,
  AffairReassignmentConflictError: class AffairReassignmentConflictError extends Error {},
}));
vi.mock("@/lib/api/with-admin-auth", () => ({ withAdminAuth: (handler: unknown) => handler }));

import { GET, POST } from "./route";

const context = { params: Promise.resolve({}) };

beforeEach(() => vi.clearAllMocks());

describe("affair-politician relationship route", () => {
  it("returns the server context for the selected affair", async () => {
    h.context.mockResolvedValue({
      affair: { id: "aff-1" },
      snapshot: { stateToken: "a".repeat(64) },
    });
    const response = await GET(
      new NextRequest(
        "https://poligraph.fr/api/admin/relationships/affairs-politicians?affairId=aff-1"
      ),
      context
    );
    expect(response.status).toBe(200);
    expect(h.context).toHaveBeenCalledWith("aff-1");
  });

  it("requires the justification and expected state before applying", async () => {
    const response = await POST(
      new NextRequest("https://poligraph.fr/api/admin/relationships/affairs-politicians", {
        method: "POST",
        body: JSON.stringify({
          affairId: "aff-1",
          politicianId: "pol-2",
          justification: "court",
          confirmation: "Affaire",
          expected: {},
        }),
        headers: { "content-type": "application/json" },
      }),
      context
    );
    expect(response.status).toBe(400);
    expect(h.reassign).not.toHaveBeenCalled();
  });
});
