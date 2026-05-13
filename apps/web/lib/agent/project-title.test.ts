import { describe, expect, it } from "vitest";
import {
  fallbackProjectTitle,
  isUsableProjectTitle,
  normalizeProjectTitleForDisplay,
  selectProjectTitleForStorage,
} from "./project-title";

describe("project-title", () => {
  const projectId = "chat-1778638147239-yoh11u";

  it("derives a stable fallback title from the project id", () => {
    expect(fallbackProjectTitle(projectId)).toBe("Project yoh11u");
  });

  it("keeps readable brand names intact", () => {
    expect(normalizeProjectTitleForDisplay("SnapsClean", projectId)).toBe("SnapsClean");
    expect(isUsableProjectTitle("SnapsClean", projectId)).toBe(true);
  });

  it("rejects placeholder titles and falls back to a stable project label", () => {
    expect(normalizeProjectTitleForDisplay("unknown", projectId)).toBe("Project yoh11u");
    expect(normalizeProjectTitleForDisplay(projectId, projectId)).toBe("Project yoh11u");
    expect(isUsableProjectTitle("New Project", projectId)).toBe(false);
  });

  it("rejects canonical prompt markdown and imperative prompt titles", () => {
    expect(
      normalizeProjectTitleForDisplay("# Canonical Website Generation Prompt\n\nInternal machine-readable content...", projectId),
    ).toBe("Project yoh11u");
    expect(
      normalizeProjectTitleForDisplay("Build a bilingual AI practice site with blog, lead capture, and editorial review.", projectId),
    ).toBe("Project yoh11u");
  });

  it("preserves an existing good title when an update provides a noisy replacement", () => {
    expect(
      selectProjectTitleForStorage({
        rawTitle: "# Canonical Website Generation Prompt\n\nInternal machine-readable content...",
        existingTitle: "SnapsClean",
        projectId,
      }),
    ).toBe("SnapsClean");
  });

  it("falls back to the stable project label when neither title is usable", () => {
    expect(
      selectProjectTitleForStorage({
        rawTitle: "unknown",
        existingTitle: "New Project",
        projectId,
      }),
    ).toBe("Project yoh11u");
  });
});
