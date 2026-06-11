import { describe, expect, it } from "vitest";

import { classifyErrorCode } from "./executor.ts";

describe("classifyErrorCode", () => {
  it("classifies provider quota exhaustion explicitly", () => {
    const message =
      "route-pricing: Error | insufficient_user_quota | 403 | new_api_error | 403 用户额度不足, 剩余额度: ＄-0.207462";

    expect(classifyErrorCode(message)).toBe("quota_exhausted");
  });
});
