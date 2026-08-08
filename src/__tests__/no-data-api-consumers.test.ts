import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DATA_API_GUARD_MESSAGE,
  findDataApiConsumers,
} from "../../scripts/guards/data-api-consumer-guard";

const ROOT = resolve(import.meta.dirname, "../..");

describe("SEC-02 Data API architecture contract", () => {
  it("keeps tracked executable and configuration files free of Data API consumers", () => {
    const violations = findDataApiConsumers(ROOT);

    expect(violations, DATA_API_GUARD_MESSAGE).toEqual([]);
  }, 15_000);
});
