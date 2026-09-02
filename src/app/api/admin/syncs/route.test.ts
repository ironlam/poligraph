import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  findFirst: vi.fn(),
  createJob: vi.fn(),
  createAudit: vi.fn(),
  transaction: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    syncJob: {
      findFirst: h.findFirst,
      update: vi.fn(),
    },
    $transaction: h.transaction,
  },
}));
vi.mock("@/lib/api/with-admin-auth", () => ({
  withAdminAuth: (handler: unknown) => handler,
}));
vi.mock("@/lib/security/validate", () => ({
  withValidation:
    (_schema: unknown, handler: (request: Request, context: unknown, body: unknown) => unknown) =>
    async (request: Request, context: unknown) =>
      handler(request, context, await request.json()),
}));
vi.mock("@/inngest/client", () => ({ inngest: { send: h.send } }));

import { POST } from "./route";

describe("POST /api/admin/syncs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.findFirst.mockResolvedValue(null);
    h.createJob.mockResolvedValue({ id: "job-1", script: "reindex-measures-search" });
    h.createAudit.mockResolvedValue({ id: "audit-1" });
    h.transaction.mockImplementation((callback) =>
      callback({
        syncJob: { create: h.createJob },
        auditLog: { create: h.createAudit },
      })
    );
    h.send.mockResolvedValue(undefined);
  });

  it("crée le job et sa trace d'audit dans la même transaction", async () => {
    const request = new Request("https://poligraph.fr/api/admin/syncs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "vitest",
        "x-forwarded-for": "203.0.113.10, 10.0.0.1",
      },
      body: JSON.stringify({ script: "reindex-measures-search" }),
    });

    const response = await POST(request as never, { params: Promise.resolve({}) });

    expect(response.status).toBe(201);
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.createAudit).toHaveBeenCalledWith({
      data: {
        action: "CREATE",
        entityType: "SyncJob",
        entityId: "job-1",
        changes: { script: "reindex-measures-search", status: "PENDING" },
        ipAddress: "203.0.113.10",
        userAgent: "vitest",
      },
    });
    expect(h.send).toHaveBeenCalledWith({
      name: "sync/reindex-measures-search",
      data: { jobId: "job-1" },
    });
  });
});
