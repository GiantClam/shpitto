import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { ProviderAttempt } from "./provider-model.ts";
import {
  rankProviderAttemptsByHealth,
  readProviderHealthStore,
  recordProviderHealthStatus,
} from "./provider-health.ts";

function buildAttempt(provider: "pptoken" | "aiberm" | "crazyroute", reason = "ordered"): ProviderAttempt {
  return {
    lock: {
      provider,
      model: "gpt-5.4-mini",
      reason,
    },
    config: {
      provider,
      apiKey: "test-key",
      baseURL: `https://${provider}.example.test/v1`,
      defaultHeaders: {},
      modelName: "gpt-5.4-mini",
    },
  };
}

describe("provider health", () => {
  it("records provider outcomes in a file-backed health store", async () => {
    const storePath = path.resolve(process.cwd(), ".tmp", "provider-health-test", "store.json");
    await fs.rm(path.dirname(storePath), { recursive: true, force: true });

    await recordProviderHealthStatus({
      attempt: buildAttempt("pptoken"),
      status: "success",
      storePath,
    });
    await recordProviderHealthStatus({
      attempt: buildAttempt("pptoken"),
      status: "retryable_failure",
      storePath,
    });

    const store = await readProviderHealthStore(storePath);
    expect(store.providers.pptoken?.successCount).toBe(1);
    expect(store.providers.pptoken?.retryableFailureCount).toBe(1);
    expect(store.providers.pptoken?.lastSuccessAt).toBeTruthy();
  });

  it("prefers providers with stronger recent health", async () => {
    const storePath = path.resolve(process.cwd(), ".tmp", "provider-health-rank", "store.json");
    await fs.rm(path.dirname(storePath), { recursive: true, force: true });

    await recordProviderHealthStatus({
      attempt: buildAttempt("pptoken", "forced"),
      status: "retryable_failure",
      storePath,
    });
    await recordProviderHealthStatus({
      attempt: buildAttempt("aiberm"),
      status: "success",
      storePath,
    });
    await recordProviderHealthStatus({
      attempt: buildAttempt("aiberm"),
      status: "success",
      storePath,
    });

    const ranked = await rankProviderAttemptsByHealth(
      [buildAttempt("pptoken", "forced"), buildAttempt("aiberm"), buildAttempt("crazyroute")],
      storePath,
    );

    expect(ranked[0]?.config.provider).toBe("aiberm");
    expect(ranked[ranked.length - 1]?.config.provider).toBe("pptoken");
  });
});
