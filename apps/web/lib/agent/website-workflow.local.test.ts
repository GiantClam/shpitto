import { describe, expect, it } from "vitest";
import {
  appendExplicitTemplateOverrideToCanonicalPrompt,
  detectExplicitTemplateStyleIdFromText,
  loadWorkflowSkillContext,
  normalizeWorkflowVisualDecisionContext,
  resolveWorkflowProviderConfigForTesting,
  resolveDesignSkillHit,
} from "./website-workflow";
import {
  containsWorkflowCjk,
  containsWorkflowEncodingNoise,
  containsWorkflowUnknownUnsafeChars,
  isWorkflowArtifactEnglishSafe,
} from "../workflow-artifact-language.ts";

describe("website-workflow local awesome-design templates", () => {
  it("loads design context from local templates without remote fetch", async () => {
    const prevRemote = process.env.AWESOME_DESIGN_ALLOW_REMOTE_FETCH;
    const prevRefresh = process.env.AWESOME_DESIGN_REFRESH;

    process.env.AWESOME_DESIGN_ALLOW_REMOTE_FETCH = "0";
    process.env.AWESOME_DESIGN_REFRESH = "1";

    try {
      const hit = await resolveDesignSkillHit("A professional website with clear navigation and strong content hierarchy");
      expect(hit.id).toBeTruthy();
      expect(hit.id).not.toBe("awesome-index-unavailable");

      const context = await loadWorkflowSkillContext(
        "A professional website with clear navigation and strong content hierarchy",
      );
      expect(context.hit.id).toBe(hit.id);
      expect(context.designMd.length).toBeGreaterThan(0);
      expect(context.stylePreset.mode === "light" || context.stylePreset.mode === "dark").toBe(true);
      expect(context.hit.style_preset).toBeTruthy();
      expect(context.templateBlueprint).toBeTruthy();
      expect(["adaptive", "fixed"]).toContain(context.templateBlueprint.routeMode);
    } finally {
      if (prevRemote === undefined) delete process.env.AWESOME_DESIGN_ALLOW_REMOTE_FETCH;
      else process.env.AWESOME_DESIGN_ALLOW_REMOTE_FETCH = prevRemote;

      if (prevRefresh === undefined) delete process.env.AWESOME_DESIGN_REFRESH;
      else process.env.AWESOME_DESIGN_REFRESH = prevRefresh;
    }
  });

  it("records transparent local selection metadata and filters stopword matches", async () => {
    const prevUseLlm = process.env.WORKFLOW_STYLE_SELECT_USE_LLM;
    process.env.WORKFLOW_STYLE_SELECT_USE_LLM = "0";

    try {
      const hit = await resolveDesignSkillHit("Professional editorial website with modern typography and precise layout");

      expect(hit.selection_mode).toBe("local_score");
      expect(hit.local_top_candidate?.id).toBe(hit.id);
      expect(hit.llm_candidate_limit).toBeGreaterThanOrEqual(3);
      expect(hit.matched_keywords).not.toContain("and");
      expect(hit.matched_keywords).not.toContain("website");
      expect(hit.selection_candidates?.[0]?.local_rank).toBe(1);
      expect(hit.selection_candidates?.[0]?.base_score).toBeTypeOf("number");
    } finally {
      if (prevUseLlm === undefined) delete process.env.WORKFLOW_STYLE_SELECT_USE_LLM;
      else process.env.WORKFLOW_STYLE_SELECT_USE_LLM = prevUseLlm;
    }
  });

  it("honors explicit style names without domain-specific guards", async () => {
    const prevUseLlm = process.env.WORKFLOW_STYLE_SELECT_USE_LLM;
    process.env.WORKFLOW_STYLE_SELECT_USE_LLM = "0";

    try {
      const hit = await resolveDesignSkillHit("Use the Claude design language for this website.");

      expect(hit.selection_mode).toBe("explicit_match");
      expect(hit.id.toLowerCase()).toContain("claude");
      expect(hit.selection_candidates?.some((candidate) => candidate.id === hit.id)).toBe(true);
    } finally {
      if (prevUseLlm === undefined) delete process.env.WORKFLOW_STYLE_SELECT_USE_LLM;
      else process.env.WORKFLOW_STYLE_SELECT_USE_LLM = prevUseLlm;
    }
  });

  it("honors explicit short style names like IBM when design intent is explicit", async () => {
    const prevUseLlm = process.env.WORKFLOW_STYLE_SELECT_USE_LLM;
    process.env.WORKFLOW_STYLE_SELECT_USE_LLM = "0";

    try {
      const hit = await resolveDesignSkillHit("Use the IBM design system for this website homepage.");

      expect(hit.selection_mode).toBe("explicit_match");
      expect(hit.id).toBe("ibm");
      expect(hit.selection_candidates?.some((candidate) => candidate.id === hit.id)).toBe(true);
    } finally {
      if (prevUseLlm === undefined) delete process.env.WORKFLOW_STYLE_SELECT_USE_LLM;
      else process.env.WORKFLOW_STYLE_SELECT_USE_LLM = prevUseLlm;
    }
  });

  it("detects explicit template overrides from follow-up dialogue text", async () => {
    await expect(
      detectExplicitTemplateStyleIdFromText(
        "Please change the visual direction. Use the IBM Carbon enterprise design system with a blue-and-white corporate technology homepage.",
      ),
    ).resolves.toBe("ibm");
  });

  it("defaults workflow style selection to a lightweight model instead of inheriting heavyweight global locks", () => {
    const prevWorkflowSelectModel = process.env.WORKFLOW_STYLE_SELECT_MODEL;
    const prevLlmWorkflowSelectModel = process.env.LLM_MODEL_WORKFLOW_STYLE_SELECT;

    delete process.env.WORKFLOW_STYLE_SELECT_MODEL;
    delete process.env.LLM_MODEL_WORKFLOW_STYLE_SELECT;

    try {
      const config = resolveWorkflowProviderConfigForTesting({
        provider: "pptoken",
        model: "gpt-5.4",
      });
      expect(config.modelName).toBe("gpt-5.4-mini");
    } finally {
      if (prevWorkflowSelectModel === undefined) delete process.env.WORKFLOW_STYLE_SELECT_MODEL;
      else process.env.WORKFLOW_STYLE_SELECT_MODEL = prevWorkflowSelectModel;
      if (prevLlmWorkflowSelectModel === undefined) delete process.env.LLM_MODEL_WORKFLOW_STYLE_SELECT;
      else process.env.LLM_MODEL_WORKFLOW_STYLE_SELECT = prevLlmWorkflowSelectModel;
    }
  });

  it("honors explicit workflow style selector model overrides when configured", () => {
    const prevWorkflowSelectModel = process.env.WORKFLOW_STYLE_SELECT_MODEL;
    process.env.WORKFLOW_STYLE_SELECT_MODEL = "gpt-5.4";

    try {
      const config = resolveWorkflowProviderConfigForTesting({
        provider: "pptoken",
        model: "gpt-5.4-mini",
      });
      expect(config.modelName).toBe("gpt-5.4");
    } finally {
      if (prevWorkflowSelectModel === undefined) delete process.env.WORKFLOW_STYLE_SELECT_MODEL;
      else process.env.WORKFLOW_STYLE_SELECT_MODEL = prevWorkflowSelectModel;
    }
  });

  it("appends a canonical prompt override block for explicit IBM template requests", () => {
    const rewritten = appendExplicitTemplateOverrideToCanonicalPrompt(
      "# Canonical Website Generation Prompt\n\n## 0. Confirmed Generation Parameters\n- Website type: Company website",
      "ibm",
    );

    expect(rewritten).toContain("## Explicit Design System Override");
    expect(rewritten).toContain("IBM Carbon enterprise design language");
  });

  it("uses prompt-adaptive design when the canonical prompt contains explicit visual requirements", async () => {
    const prevUseLlm = process.env.WORKFLOW_STYLE_SELECT_USE_LLM;
    process.env.WORKFLOW_STYLE_SELECT_USE_LLM = "0";

    try {
      const prompt = [
        "Canonical Website Generation Prompt for CASUX.",
        "Visual style: fresh green #2E8B57 and white as the main palette, warm orange accents.",
        "The mood must feel natural, safe, warm, child-friendly, and professionally institutional.",
        "Avoid cold developer-tool or generic SaaS aesthetics.",
      ].join("\n");
      const hit = await resolveDesignSkillHit(prompt);

      expect(hit.selection_mode).toBe("prompt_adaptive");
      expect(hit.id).toBe("prompt-adaptive");
      expect(hit.local_top_candidate?.id).toBeTruthy();
      expect(hit.local_top_candidate?.id).not.toBe("prompt-adaptive");
      expect(hit.design_md_inline).toContain("Prompt-Adaptive Design System");

      const context = await loadWorkflowSkillContext(prompt);
      expect(context.hit.id).toBe("prompt-adaptive");
      expect(context.designMd).toContain("Prompt-Adaptive Design System");
      expect(context.stylePreset.colors.primary).toBe("#2E8B57");
      expect(context.stylePreset.colors.accent).toBe("#F59E0B");
      expect(context.stylePreset.mode).toBe("light");
    } finally {
      if (prevUseLlm === undefined) delete process.env.WORKFLOW_STYLE_SELECT_USE_LLM;
      else process.env.WORKFLOW_STYLE_SELECT_USE_LLM = prevUseLlm;
    }
  });

  it("does not treat generic domain tokens as explicit awesome-design template names", async () => {
    const prevUseLlm = process.env.WORKFLOW_STYLE_SELECT_USE_LLM;
    process.env.WORKFLOW_STYLE_SELECT_USE_LLM = "0";

    try {
      const prompt = [
        "# Canonical Website Generation Prompt",
        "Source: uploaded-file:CASUX_.md.pdf from casux.org.cn.",
        "Website positioning: CASUX is a child-friendly space standard system and research platform.",
        "Visual style: use fresh green #2E8B57 and white as the primary palette with warm orange accents.",
        "The design must feel natural, safe, warm, child-friendly, and institutionally professional.",
      ].join("\n");
      const hit = await resolveDesignSkillHit(prompt);

      expect(hit.id).toBe("prompt-adaptive");
      expect(hit.selection_mode).toBe("prompt_adaptive");
      expect(hit.id).not.toBe("cal");
      expect(hit.style_preset?.colors?.primary).toBe("#2E8B57");
    } finally {
      if (prevUseLlm === undefined) delete process.env.WORKFLOW_STYLE_SELECT_USE_LLM;
      else process.env.WORKFLOW_STYLE_SELECT_USE_LLM = prevUseLlm;
    }
  });

  it("locks a structured explicit open-design direction above prompt-adaptive runtime selection", async () => {
    const prevUseLlm = process.env.WORKFLOW_STYLE_SELECT_USE_LLM;
    process.env.WORKFLOW_STYLE_SELECT_USE_LLM = "0";

    try {
      const prompt = [
        "# Canonical Website Generation Prompt",
        "Visual style: fresh green #2E8B57 and white as the main palette, warm orange accents.",
        "The mood must feel natural, safe, warm, child-friendly, and professionally institutional.",
      ].join("\n");
      const hit = await resolveDesignSkillHit(prompt, {
        primaryVisualDirection: "heritage-manufacturing",
        visualDecisionSource: "user_explicit",
        lockPrimaryVisualDirection: true,
      });

      expect(hit.selection_mode).toBe("open_design_explicit");
      expect(hit.id).toBe("open-design-heritage-manufacturing");
      expect(hit.design_md_inline).toContain("Open Design Direction: Heritage manufacturing / craft");
      expect(hit.design_md_inline).not.toContain("Prompt-Adaptive Design System");
    } finally {
      if (prevUseLlm === undefined) delete process.env.WORKFLOW_STYLE_SELECT_USE_LLM;
      else process.env.WORKFLOW_STYLE_SELECT_USE_LLM = prevUseLlm;
    }
  });

  it("uses structured orchestrator visual decisions before prompt-derived runtime guessing", async () => {
    const prevUseLlm = process.env.WORKFLOW_STYLE_SELECT_USE_LLM;
    process.env.WORKFLOW_STYLE_SELECT_USE_LLM = "0";

    try {
      const prompt = [
        "# Canonical Website Generation Prompt",
        "Visual style: fresh green #2E8B57 and white as the main palette, warm orange accents.",
        "The mood must feel natural, safe, warm, child-friendly, and professionally institutional.",
      ].join("\n");
      const hit = await resolveDesignSkillHit(prompt, {
        primaryVisualDirection: "industrial-b2b",
        visualDecisionSource: "user_recommended_default",
        lockPrimaryVisualDirection: false,
      });

      expect(hit.selection_mode).toBe("open_design_context");
      expect(hit.id).toBe("open-design-industrial-b2b");
      expect(hit.design_md_inline).toContain("Open Design Direction: Industrial B2B / precision");
      expect(hit.design_md_inline).not.toContain("Prompt-Adaptive Design System");
    } finally {
      if (prevUseLlm === undefined) delete process.env.WORKFLOW_STYLE_SELECT_USE_LLM;
      else process.env.WORKFLOW_STYLE_SELECT_USE_LLM = prevUseLlm;
    }
  });

  it("honors explicit templateStyleId overrides before prompt-adaptive guessing", async () => {
    const prevUseLlm = process.env.WORKFLOW_STYLE_SELECT_USE_LLM;
    process.env.WORKFLOW_STYLE_SELECT_USE_LLM = "0";

    try {
      const prompt = [
        "# Canonical Website Generation Prompt",
        "Visual style: fresh green #2E8B57 and white as the main palette, warm orange accents.",
        "The mood must feel natural, safe, warm, child-friendly, and professionally institutional.",
      ].join("\n");
      const hit = await resolveDesignSkillHit(prompt, {
        templateStyleId: "ibm",
      });

      expect(hit.selection_mode).toBe("explicit_match");
      expect(hit.id).toBe("ibm");
      expect(hit.design_md_path).toContain("design-md/ibm");
    } finally {
      if (prevUseLlm === undefined) delete process.env.WORKFLOW_STYLE_SELECT_USE_LLM;
      else process.env.WORKFLOW_STYLE_SELECT_USE_LLM = prevUseLlm;
    }
  });

  it("does not treat incidental source-signal style names as explicit visual references", async () => {
    const prevUseLlm = process.env.WORKFLOW_STYLE_SELECT_USE_LLM;
    process.env.WORKFLOW_STYLE_SELECT_USE_LLM = "0";

    try {
      const prompt = [
        "# Canonical Website Generation Prompt",
        "- Website type: Company website",
        "- Target audience: Enterprise buyers, manufacturer, procurement",
        "- Primary visual direction: Heritage manufacturing / craft",
        "- Secondary visual tags: warm",
        "- Business/content details: Key source signals: Shpitto, Claude, GPT, AI, VBUY, Textile, B2B, ISO9001.",
      ].join("\n");
      const hit = await resolveDesignSkillHit(prompt, {
        primaryVisualDirection: "heritage-manufacturing",
        visualDecisionSource: "user_recommended_default",
        lockPrimaryVisualDirection: false,
      });

      expect(hit.selection_mode).toBe("open_design_context");
      expect(hit.id).toBe("open-design-heritage-manufacturing");
      expect(hit.design_md_inline).toContain("Open Design Direction: Heritage manufacturing / craft");
    } finally {
      if (prevUseLlm === undefined) delete process.env.WORKFLOW_STYLE_SELECT_USE_LLM;
      else process.env.WORKFLOW_STYLE_SELECT_USE_LLM = prevUseLlm;
    }
  });

  it("filters direction ids out of structured secondary visual tags", () => {
    expect(
      normalizeWorkflowVisualDecisionContext({
        primaryVisualDirection: "industrial-b2b",
        secondaryVisualTags: ["minimal", "heritage-manufacturing", "trustworthy"],
        visualDecisionSource: "user_recommended_default",
      }),
    ).toEqual({
      primaryVisualDirection: "industrial-b2b",
      secondaryVisualTags: ["minimal", "trustworthy"],
      visualDecisionSource: "user_recommended_default",
      lockPrimaryVisualDirection: false,
    });
  });

  it("normalizes local design references into English-safe workflow text while preserving Unicode punctuation", async () => {
    const prevUseLlm = process.env.WORKFLOW_STYLE_SELECT_USE_LLM;
    process.env.WORKFLOW_STYLE_SELECT_USE_LLM = "0";

    try {
      const context = await loadWorkflowSkillContext("Use the Apple design language for this website.");
      expect(context.hit.id).toContain("apple");
      expect(context.designMd).toContain("Apple's website is a masterclass in controlled drama —");
      expect(context.designMd).toContain("minimalism as aesthetic preference; it is minimalism as reverence for the object.");
      expect(context.designMd).toContain("precise, confident, and unapologetically direct.");
      expect(context.designMd).toContain("dark sections feel immersive and premium");
      expect(context.designMd).not.toContain("鈥");
      expect(context.designMd).not.toContain("â€");
      expect(containsWorkflowCjk(context.designMd)).toBe(false);
      expect(containsWorkflowEncodingNoise(context.designMd)).toBe(false);
      expect(containsWorkflowUnknownUnsafeChars(context.designMd)).toBe(false);
      expect(isWorkflowArtifactEnglishSafe(context.designMd)).toBe(true);
    } finally {
      if (prevUseLlm === undefined) delete process.env.WORKFLOW_STYLE_SELECT_USE_LLM;
      else process.env.WORKFLOW_STYLE_SELECT_USE_LLM = prevUseLlm;
    }
  });
});
