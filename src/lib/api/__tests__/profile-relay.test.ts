import { describe, expect, it, vi } from "vitest";

import { postProfileRelay } from "../profile-relay";

const ENDPOINT = "https://example.test/api/cron/revalidate";
const BODY = { profileRefresh: { politicianIds: ["a"], reason: "r" } };

describe("postProfileRelay", () => {
  it("poste le corps avec le secret", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await postProfileRelay(ENDPOINT, "secret", BODY, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer secret");
    expect(JSON.parse(init.body)).toEqual(BODY);
  });

  it("lève quand la route refuse, pour que l'appelant le journalise", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 502 });
    await expect(
      postProfileRelay(ENDPOINT, "secret", BODY, fetchImpl as unknown as typeof fetch)
    ).rejects.toThrow("HTTP 502");
  });
});
