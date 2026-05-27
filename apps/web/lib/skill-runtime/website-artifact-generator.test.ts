import { describe, expect, it } from "vitest";

import {
  renderWebsiteArtifactGeneratorContract,
  resolveWebsiteArtifactGeneratorMode,
  websiteArtifactGeneratorEnablesImportedSkills,
} from "./website-artifact-generator";

describe("website-artifact-generator", () => {
  it("defaults the main website generation path to hybrid", () => {
    expect(resolveWebsiteArtifactGeneratorMode(undefined)).toBe("hybrid");
    expect(websiteArtifactGeneratorEnablesImportedSkills("hybrid")).toBe(true);
  });

  it("keeps native as an explicit opt-out path", () => {
    expect(resolveWebsiteArtifactGeneratorMode("native")).toBe("native");
    expect(websiteArtifactGeneratorEnablesImportedSkills("native")).toBe(false);
  });

  it("renders the Shpitto UI preservation boundary for hybrid mode", () => {
    const contract = renderWebsiteArtifactGeneratorContract({
      mode: "hybrid",
      surfaceMode: "docs-knowledge-site",
      selectedSeedSkillIds: ["docs-knowledge-foundation", "docs-reference-template"],
    });

    expect(contract).toContain("site_generator_mode: hybrid");
    expect(contract).toContain("functionality_port_scope: port generation functionality");
    expect(contract).toContain("shpitto_ui_theme_boundary: Shpitto Studio and platform UI keep the app theme");
    expect(contract).toContain("selected_frontend_seed_skills: docs-knowledge-foundation, docs-reference-template");
  });
});
