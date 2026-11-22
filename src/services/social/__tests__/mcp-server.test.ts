import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMcpHandler } from "@modelcontextprotocol/server";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    socialPost: { create: mocks.create, findUnique: mocks.findUnique },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("@/lib/api/social-networks", () => ({
  publishToBluesky: vi.fn(),
  publishToX: vi.fn(),
  checkBlueskyAccount: vi.fn(),
  checkXAccount: vi.fn(),
}));

import { createSocialMcpServer } from "../mcp-server";

const handler = createMcpHandler(() => createSocialMcpServer({ actor: "mcp:test" }));

async function rpc(method: string, params: Record<string, unknown> = {}) {
  const response = await handler.fetch(
    new Request("https://poligraph.fr/api/mcp/social", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-06-18",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    })
  );
  const text = await response.text();
  // Stateless legacy serving may answer over SSE: keep the data line of the single event.
  const json = text.startsWith("{") ? text : text.split("\n").find((l) => l.startsWith("data:"))!;
  return JSON.parse(json.replace(/^data:\s*/, ""));
}

describe("social MCP server", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists the five tools with publication marked destructive", async () => {
    const response = await rpc("tools/list");
    const tools = response.result.tools as {
      name: string;
      annotations?: Record<string, boolean>;
    }[];
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "social_creer_brouillon",
      "social_lister",
      "social_publier",
      "social_rejeter",
      "social_verifier_comptes",
    ]);
    const publish = tools.find((tool) => tool.name === "social_publier");
    expect(publish?.annotations?.destructiveHint).toBe(true);
    const check = tools.find((tool) => tool.name === "social_verifier_comptes");
    expect(check?.annotations?.readOnlyHint).toBe(true);
  });

  it("refuses an X draft with a link without writing anything", async () => {
    const response = await rpc("tools/call", {
      name: "social_creer_brouillon",
      arguments: { categorie: "votes", texteX: "Tout est sur poligraph.fr" },
    });
    expect(response.result.isError).toBe(true);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("stores a valid draft as PENDING_REVIEW", async () => {
    mocks.create.mockResolvedValue({
      id: "post-1",
      category: "opendata",
      status: "PENDING_REVIEW",
      content: "Texte Bluesky",
      twitterContent: "Texte X",
      blueskyUrl: null,
      twitterUrl: null,
      error: null,
      createdAt: new Date("2026-11-22T10:00:00Z"),
      postedAt: null,
    });
    const response = await rpc("tools/call", {
      name: "social_creer_brouillon",
      arguments: { categorie: "opendata", texteBluesky: "Texte Bluesky", texteX: "Texte X" },
    });
    expect(response.result.isError).toBeUndefined();
    expect(mocks.create.mock.calls[0]![0].data).toMatchObject({
      category: "opendata",
      content: "Texte Bluesky",
      twitterContent: "Texte X",
      status: "PENDING_REVIEW",
    });
  });
});
