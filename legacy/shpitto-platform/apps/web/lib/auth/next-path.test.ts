import { describe, expect, it } from "vitest";
import { DEFAULT_AUTH_NEXT_PATH, safeAuthNextPath, withAuthNextPath } from "./next-path";

describe("auth next path helpers", () => {
  it("accepts only safe internal paths", () => {
    expect(safeAuthNextPath("/projects/demo/data")).toBe("/projects/demo/data");
    expect(safeAuthNextPath(["/projects/demo/data"])).toBe("/projects/demo/data");
    expect(safeAuthNextPath("https://evil.example")).toBe(DEFAULT_AUTH_NEXT_PATH);
    expect(safeAuthNextPath("//evil.example")).toBe(DEFAULT_AUTH_NEXT_PATH);
    expect(safeAuthNextPath("")).toBe(DEFAULT_AUTH_NEXT_PATH);
  });

  it("preserves next paths on auth links only when needed", () => {
    expect(withAuthNextPath("/login", "/launch-center")).toBe("/login");
    expect(withAuthNextPath("/login", "/projects/demo/data")).toBe("/login?next=%2Fprojects%2Fdemo%2Fdata");
  });
});
