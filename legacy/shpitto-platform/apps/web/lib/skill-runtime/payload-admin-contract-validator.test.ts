import { describe, expect, it } from "vitest";
import { validateAiImageToolPayloadAdminContract } from "./payload-admin-contract-validator.ts";

describe("ai-image-tool payload admin contract validator", () => {
  it("confirms the baseline covers required payload globals, collections, and boundaries", () => {
    const result = validateAiImageToolPayloadAdminContract();

    expect(result.valid).toBe(true);
    expect(result.schemaFilePresent).toBe(true);
    expect(result.missingGlobals).toEqual([]);
    expect(result.missingCollections).toEqual([]);
    expect(result.missingLocalizedGlobals).toEqual([]);
    expect(result.missingLocalizedCollections).toEqual([]);
    expect(result.missingConfigKeys).toEqual([]);
    expect(result.missingForbiddenDataDomains).toEqual([]);
  });
});
