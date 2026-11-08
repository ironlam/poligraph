// @vitest-environment node
import { expect, it, vi } from "vitest";
import Image from "../opengraph-image";

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  readFile: vi
    .fn()
    .mockRejectedValue(Object.assign(new Error("Police absente"), { code: "ENOENT" })),
}));

vi.mock("@/lib/db", () => ({
  db: { scrutin: { findUnique: vi.fn().mockResolvedValue(null) } },
}));

it("rend un PNG avec la police par défaut quand les polices de marque sont indisponibles", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const response = await Image({ params: Promise.resolve({ slug: "scrutin-introuvable" }) });
    const png = Buffer.from(await response.arrayBuffer());

    expect(response.headers.get("content-type")).toBe("image/png");
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  } finally {
    log.mockRestore();
  }
});
