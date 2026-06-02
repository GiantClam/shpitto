import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";

const buildPromptDraftWithResearchMock = vi.fn();
const createSkillToolRouteUnitGenerationWorkerMock = vi.fn();
const createBundleMock = vi.fn();
const selectWebsiteGenerationTypeSkillMock = vi.fn();

vi.mock("./prompt-draft-research.ts", () => ({
  buildPromptDraftWithResearch: buildPromptDraftWithResearchMock,
}));

vi.mock("../skill-runtime/v2-route-generation-worker.ts", () => ({
  createSkillToolRouteUnitGenerationWorker: createSkillToolRouteUnitGenerationWorkerMock,
}));

vi.mock("../bundler.ts", () => ({
  Bundler: {
    createBundle: createBundleMock,
  },
}));

vi.mock("../skill-runtime/website-type-selector.ts", () => ({
  selectWebsiteGenerationTypeSkill: selectWebsiteGenerationTypeSkillMock,
}));

describe("website generation mvp", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("builds a clean isolated runtime state from prompt draft output", async () => {
    buildPromptDraftWithResearchMock.mockResolvedValue({
      canonicalPrompt: "# Canonical Prompt",
      usedWebSearch: false,
      sources: [],
      promptControlManifest: {
        schemaVersion: 1,
        promptKind: "canonical_website_prompt",
        routeSource: "uploaded_source_page_plan",
        routes: ["/", "/research"],
        navLabels: ["Home", "Research"],
        files: ["/styles.css", "/script.js", "/index.html", "/research/index.html"],
        pageIntents: [],
      },
      websiteSurfaceMode: "content-hub-site",
      discoveryBrief: {
        surfaceMode: "content-hub-site",
        audience: [],
        primaryGoal: "Institutional resource discovery",
        routes: ["/", "/research"],
        sourcePriority: "uploaded_files",
        localeMode: "en",
        immutableConstraints: ["locale:en"],
        confirmationStatus: "needs_confirmation",
      },
      structuredSourceFacts: {
        brandCandidates: ["Northstar Labs"],
        audienceSignals: ["Enterprise platform teams"],
        offeringSignals: ["AI workflow governance"],
        proofSignals: [],
        contactSignals: ["northstar@example.com"],
        navCandidates: [{ label: "Home", source: "uploaded file", confidence: 0.92 }],
        pageCandidates: [{ route: "/", title: "Home", source: "uploaded file", confidence: 0.92 }],
      },
      promptBudgetEnvelope: {
        canonicalRequirementChars: 2600,
        evidenceBriefChars: 4800,
        perPageEvidenceChars: 420,
        sourceSnippetChars: 2400,
        truncationPolicy: "page_scoped_drop",
      },
      evidenceBrief: {
        sourceMode: "uploaded_files",
        priorityFacts: [],
        sourcePriorities: [],
        pageBriefs: [],
        contentGaps: [],
        assumptions: [],
      },
      knowledgeProfile: {
        sourceMode: "uploaded_files",
        domains: [],
        sources: [],
        brand: { name: "Northstar Labs" },
        audience: [],
        offerings: [],
        differentiators: [],
        proofPoints: [],
        suggestedPages: [],
        contentGaps: [],
        summary: "Northstar Labs summary",
      },
    });
    selectWebsiteGenerationTypeSkillMock.mockReturnValue({
      surfaceMode: "content-hub-site",
      skillId: "content-hub-foundation",
      siteType: "content_hub",
    });

    const { prepareWebsiteGenerationMvp } = await import("./website-generation-mvp");
    const result = await prepareWebsiteGenerationMvp({
      requirementText: "Build a resource website for Northstar Labs from uploaded documents.",
      referencedAssets: ['Asset "northstar.pdf" URL: https://example.test/northstar.pdf'],
    });

    expect(buildPromptDraftWithResearchMock).toHaveBeenCalledTimes(1);
    expect(buildPromptDraftWithResearchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        disableWebSearch: true,
        routePolicy: "force_root_single_page",
      }),
    );
    expect(result.manifest.routes).toEqual(["/", "/research"]);
    expect(result.discoveryBrief.confirmationStatus).toBe("confirmed");
    expect((result.initialState as any).workflow_context.structuredSourceFacts.brandCandidates).toEqual([
      "Northstar Labs",
    ]);
    expect((result.initialState as any).workflow_context.promptBudgetEnvelope.truncationPolicy).toBe(
      "page_scoped_drop",
    );
    expect((result.initialState as any).workflow_context.websiteSurfaceMode).toBe("content-hub-site");
    expect(result.generationContract.contractHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.generationContract.selectedSeedSkillManifest.selected).toEqual([
      expect.objectContaining({ id: "content-hub-foundation", source: "shpitto" }),
    ]);
    expect((result.initialState as any).workflow_context.contractHash).toBe(result.generationContract.contractHash);
    expect(Array.isArray((result.initialState as any).workflow_context.routeUnitContracts)).toBe(true);
    expect((result.initialState as any).workflow_context.routeUnitContracts[0]).toEqual(
      expect.objectContaining({ route: "/", navLabel: "Home" }),
    );
  });

  it("runs the isolated MVP lane and materializes static files", async () => {
    const outputDir = "D:/github/shpitto/apps/web/.tmp/website-generation-mvp-test";
    await import("node:fs/promises").then((fs) => fs.rm(outputDir, { recursive: true, force: true }));
    buildPromptDraftWithResearchMock.mockResolvedValue({
      canonicalPrompt: "# Canonical Prompt",
      usedWebSearch: false,
      sources: [],
      promptControlManifest: {
        schemaVersion: 1,
        promptKind: "canonical_website_prompt",
        routeSource: "prompt_draft_page_plan",
        routes: ["/"],
        navLabels: ["Home"],
        files: ["/styles.css", "/script.js", "/index.html"],
        pageIntents: [],
      },
      websiteSurfaceMode: "corporate-b2b-site",
      discoveryBrief: {
        surfaceMode: "corporate-b2b-site",
        audience: [],
        primaryGoal: "Lead generation",
        routes: ["/"],
        sourcePriority: "user",
        localeMode: "en",
        immutableConstraints: ["locale:en"],
        confirmationStatus: "needs_confirmation",
      },
      structuredSourceFacts: undefined,
      promptBudgetEnvelope: undefined,
      evidenceBrief: undefined,
      knowledgeProfile: undefined,
    });
    selectWebsiteGenerationTypeSkillMock.mockReturnValue({
      surfaceMode: "corporate-b2b-site",
      skillId: "corporate-b2b-foundation",
      siteType: "corporate",
    });
    createSkillToolRouteUnitGenerationWorkerMock.mockReturnValue({
      id: "test-direct-route-worker",
      capabilities: ["route-unit", "test"],
      runUnit: async (input: any) => ({
        unitId: input.unitId,
        status: "passed",
        files: [
          input.targetFiles.includes("/index.html")
            ? {
                path: "/index.html",
                content:
                  "<!doctype html><html><body><header><nav><a href=\"/\">Home</a></nav></header><main><h1>Northstar Labs</h1><p>Northstar Labs helps enterprise platform teams design, govern, and operate AI workflow systems with clear operating models, delivery guidance, and measurable rollout support.</p><section><h2>Lead generation</h2><p>Book a consultation to review readiness, platform architecture, and rollout sequencing.</p></section></main><footer>Footer</footer></body></html>",
              }
            : null,
          input.targetFiles.includes("/styles.css") ? { path: "/styles.css", content: "body{color:black}" } : null,
          input.targetFiles.includes("/script.js") ? { path: "/script.js", content: "console.log('ready')" } : null,
        ].filter(Boolean),
      }),
    });
    createBundleMock.mockResolvedValue({
      fileEntries: [
        {
          path: "/index.html",
          content:
            "<!doctype html><html><body><header><nav><a href=\"/\">Home</a></nav></header><main><h1>Northstar Labs</h1><p>Northstar Labs helps enterprise platform teams design, govern, and operate AI workflow systems with clear operating models, delivery guidance, and measurable rollout support.</p><section><h2>Lead generation</h2><p>Book a consultation to review readiness, platform architecture, and rollout sequencing.</p></section></main><footer>Footer</footer></body></html>",
        },
        { path: "/styles.css", content: "body{color:black}" },
        { path: "/script.js", content: "console.log('ready')" },
      ],
    });

    const { runWebsiteGenerationMvp } = await import("./website-generation-mvp");
    const result = await runWebsiteGenerationMvp({
      requirementText: "Build a compact corporate website for Northstar Labs.",
      outputDir,
      timeoutMs: 1000,
    });

    expect(createSkillToolRouteUnitGenerationWorkerMock).toHaveBeenCalledTimes(1);
    expect(createBundleMock).toHaveBeenCalledTimes(0);
    expect(result.generatedFiles).toEqual(["/index.html", "/styles.css", "/script.js"]);
    expect(result.verification.status).toBe("passed");
    expect(result.generationContract.contractHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.siteDir.replace(/\\/g, "/")).toContain("/.tmp/website-generation-mvp-test/site");
    expect(result.checkpointDir.replace(/\\/g, "/")).toContain("/.tmp/website-generation-mvp-test/checkpoints");
    const checkpointFiles = await import("node:fs/promises").then((fs) => fs.readdir(result.checkpointDir));
    expect(checkpointFiles.some((file) => /^\d{2}-/.test(file))).toBe(true);
    const checkpointSiteIndex = await import("node:fs/promises").then((fs) =>
      fs.readFile("D:/github/shpitto/apps/web/.tmp/website-generation-mvp-test/checkpoints/site/index.html", "utf8"),
    );
    expect(checkpointSiteIndex).toContain("Northstar Labs");
    const metadata = JSON.parse(
      await import("node:fs/promises").then((fs) =>
        fs.readFile("D:/github/shpitto/apps/web/.tmp/website-generation-mvp-test/prompt-draft-metadata.json", "utf8"),
      ),
    );
    const runtimeSummary = JSON.parse(
      await import("node:fs/promises").then((fs) =>
        fs.readFile("D:/github/shpitto/apps/web/.tmp/website-generation-mvp-test/v2-runtime-summary.json", "utf8"),
      ),
    );
    expect(metadata.contractHash).toBe(result.generationContract.contractHash);
    expect(metadata.generationContract.contractHash).toBe(result.generationContract.contractHash);
    expect(runtimeSummary.contractHash).toBe(result.generationContract.contractHash);
    expect(runtimeSummary.verification.status).toBe("passed");
  });

  it("recovers a site from V2 checkpoints without rerunning generation", async () => {
    const outputDir = "D:/github/shpitto/apps/web/.tmp/website-generation-mvp-recover-test";
    const checkpointDir = path.join(outputDir, "checkpoints");
    await import("node:fs/promises").then((fs) => fs.rm(outputDir, { recursive: true, force: true }));
    await import("node:fs/promises").then((fs) => fs.mkdir(path.join(checkpointDir, "site", "research"), { recursive: true }));
    const { buildImmutableGenerationContract } = await import("../skill-runtime/generation-contract.ts");
    const contract = buildImmutableGenerationContract({
      generationLane: "website-generation-mvp",
      websiteSurfaceMode: "content-hub-site",
      promptControlManifest: {
        routes: ["/", "/research"],
        pageIntents: [
          { route: "/", navLabel: "Home", pageKind: "home", purpose: "Institutional homepage." },
          { route: "/research", navLabel: "Research", pageKind: "content-collection-index", purpose: "Research archive." },
        ],
      },
      discoveryBrief: {
        surfaceMode: "content-hub-site",
        routes: ["/", "/research"],
      },
      selectedSeedSkillManifest: {
        selected: [{ id: "content-hub-site", source: "shpitto" }],
      },
    });
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(path.join(checkpointDir, "generation-contract.json"), JSON.stringify(contract, null, 2), "utf8"),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(
        path.join(checkpointDir, "site", "index.html"),
        "<!doctype html><html><body><header><nav><a href=\"/\">Home</a><a href=\"/research\">Research</a></nav></header><main><h1>Northstar Labs</h1><p>Northstar Labs is the institutional home for research resources, guidance, and governance support for enterprise platform teams. The homepage explains the operating model, the public knowledge base, the delivery guidance, and the evidence pathways that help teams assess readiness before they request deeper collaboration.</p><section><h2>Institutional overview</h2><p>Use this homepage to understand the scope of the program, the way research is organized, and the practical routes that connect planning, standards, implementation, and public documentation. It is written as an institutional overview rather than a route map or an empty landing panel.</p></section></main><footer>Footer</footer></body></html>",
        "utf8",
      ),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(
        path.join(checkpointDir, "site", "research", "index.html"),
        "<!doctype html><html><body><header><nav><a href=\"/\">Home</a><a href=\"/research\">Research</a></nav></header><main><h1>Research</h1><p>The research archive curates studies, standards resources, and evidence-backed materials for policy, implementation, and training teams. It groups methods notes, reference summaries, collaboration documents, and evidence-backed briefs so institutions can move from general interest to a more grounded review of available knowledge.</p><section><h2>Curated archive</h2><p>Each entry is intended to support policy, implementation, and training conversations with enough detail to avoid thin placeholder copy and enough structure to feel like a real institutional archive rather than a generic blog index.</p></section></main><footer>Footer</footer></body></html>",
        "utf8",
      ),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(path.join(checkpointDir, "site", "styles.css"), "body{color:black}", "utf8"),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(path.join(checkpointDir, "site", "script.js"), "console.log('ready')", "utf8"),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(
        path.join(checkpointDir, "route-home.verification.json"),
        JSON.stringify(
          {
            route: "/",
            htmlPath: "/index.html",
            status: "passed",
            checkedFiles: ["/index.html", "/styles.css", "/script.js"],
            issues: [],
            violatedFields: [],
            evidence: [],
          },
          null,
          2,
        ),
        "utf8",
      ),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(
        path.join(checkpointDir, "route-research.verification.json"),
        JSON.stringify(
          {
            route: "/research",
            htmlPath: "/research/index.html",
            status: "passed",
            checkedFiles: ["/research/index.html", "/styles.css", "/script.js"],
            issues: [],
            violatedFields: [],
            evidence: [],
          },
          null,
          2,
        ),
        "utf8",
      ),
    );

    createBundleMock.mockResolvedValue({
      fileEntries: [
        {
          path: "/index.html",
          content:
            "<!doctype html><html><body><header><nav><a href=\"/\">Home</a><a href=\"/research\">Research</a></nav></header><main><h1>Northstar Labs</h1><p>Northstar Labs is the institutional home for research resources, guidance, and governance support for enterprise platform teams. The homepage explains the operating model, the public knowledge base, the delivery guidance, and the evidence pathways that help teams assess readiness before they request deeper collaboration.</p><section><h2>Institutional overview</h2><p>Use this homepage to understand the scope of the program, the way research is organized, and the practical routes that connect planning, standards, implementation, and public documentation. It is written as an institutional overview rather than a route map or an empty landing panel.</p></section></main><footer>Footer</footer></body></html>",
        },
        {
          path: "/research/index.html",
          content:
            "<!doctype html><html><body><header><nav><a href=\"/\">Home</a><a href=\"/research\">Research</a></nav></header><main><h1>Research</h1><p>The research archive curates studies, standards resources, and evidence-backed materials for policy, implementation, and training teams. It groups methods notes, reference summaries, collaboration documents, and evidence-backed briefs so institutions can move from general interest to a more grounded review of available knowledge.</p><section><h2>Curated archive</h2><p>Each entry is intended to support policy, implementation, and training conversations with enough detail to avoid thin placeholder copy and enough structure to feel like a real institutional archive rather than a generic blog index.</p></section></main><footer>Footer</footer></body></html>",
        },
        { path: "/styles.css", content: "body{color:black}" },
        { path: "/script.js", content: "console.log('ready')" },
      ],
    });

    const { recoverWebsiteGenerationMvpFromCheckpoints } = await import("./website-generation-mvp");
    const recovered = await recoverWebsiteGenerationMvpFromCheckpoints({ outputDir });

    expect(recovered.verification.status).toBe("passed");
    expect(recovered.recoveredFrom).toBe("checkpoint-site");
    expect(recovered.previewOnly).toBe(false);
    expect(recovered.generatedFiles).toEqual(
      expect.arrayContaining(["/index.html", "/research/index.html", "/styles.css", "/script.js"]),
    );
    const siteIndex = await import("node:fs/promises").then((fs) =>
      fs.readFile(path.join(outputDir, "site", "index.html"), "utf8"),
    );
    expect(siteIndex).toContain("Northstar Labs");
  });

  it("materializes route-unit-v2 recovered files without using the legacy bundler path", async () => {
    const outputDir = "D:/github/shpitto/apps/web/.tmp/website-generation-mvp-recover-preview-test";
    const checkpointDir = path.join(outputDir, "checkpoints");
    await import("node:fs/promises").then((fs) => fs.rm(outputDir, { recursive: true, force: true }));
    await import("node:fs/promises").then((fs) => fs.mkdir(path.join(checkpointDir, "site"), { recursive: true }));
    const { buildImmutableGenerationContract } = await import("../skill-runtime/generation-contract.ts");
    const contract = buildImmutableGenerationContract({
      generationLane: "website-generation-mvp",
      websiteSurfaceMode: "content-hub-site",
      promptControlManifest: {
        routes: ["/"],
        pageIntents: [{ route: "/", navLabel: "Home", pageKind: "home", purpose: "Institutional homepage." }],
      },
      discoveryBrief: {
        surfaceMode: "content-hub-site",
        routes: ["/"],
      },
      selectedSeedSkillManifest: {
        selected: [{ id: "content-hub-site", source: "shpitto" }],
      },
    });
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(path.join(checkpointDir, "generation-contract.json"), JSON.stringify(contract, null, 2), "utf8"),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(
        path.join(checkpointDir, "site", "index.html"),
        "<!doctype html><html><body><header><nav><a href=\"/\">Home</a></nav></header><main><h1>Northstar Labs</h1><p>This recovered homepage is intentionally available as preview output even when verification later marks it for additional contract tightening.</p></main></body></html>",
        "utf8",
      ),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(path.join(checkpointDir, "site", "styles.css"), "body{color:black}", "utf8"),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(path.join(checkpointDir, "site", "script.js"), "console.log('ready')", "utf8"),
    );

    createBundleMock.mockImplementation(() => {
      throw new Error("bundler should not be used for route-unit-v2 recovery");
    });

    const { recoverWebsiteGenerationMvpFromCheckpoints } = await import("./website-generation-mvp");
    const recovered = await recoverWebsiteGenerationMvpFromCheckpoints({
      outputDir,
      allowFailedVerification: true,
    });

    expect(recovered.previewOnly).toBe(true);
    const siteIndex = await import("node:fs/promises").then((fs) =>
      fs.readFile(path.join(outputDir, "site", "index.html"), "utf8"),
    );
    expect(siteIndex).toContain("Northstar Labs");
  });

  it("repairs failed checkpoint routes during recovery before returning preview-only", async () => {
    const outputDir = "D:/github/shpitto/apps/web/.tmp/website-generation-mvp-recover-repair-test";
    const checkpointDir = path.join(outputDir, "checkpoints");
    await import("node:fs/promises").then((fs) => fs.rm(outputDir, { recursive: true, force: true }));
    await import("node:fs/promises").then((fs) => fs.mkdir(path.join(checkpointDir, "site"), { recursive: true }));
    const { buildImmutableGenerationContract } = await import("../skill-runtime/generation-contract.ts");
    const contract = buildImmutableGenerationContract({
      generationLane: "website-generation-mvp",
      websiteSurfaceMode: "content-hub-site",
      promptControlManifest: {
        routes: ["/"],
        pageIntents: [{ route: "/", navLabel: "Home", pageKind: "home", purpose: "Institutional homepage." }],
      },
      discoveryBrief: {
        surfaceMode: "content-hub-site",
        routes: ["/"],
      },
      selectedSeedSkillManifest: {
        selected: [{ id: "content-hub-site", source: "shpitto" }],
      },
    });
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(path.join(outputDir, "canonical-prompt.md"), "# Canonical Prompt", "utf8"),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(
        path.join(outputDir, "prompt-draft-metadata.json"),
        JSON.stringify(
          {
            promptControlManifest: contract.promptControlManifest,
            discoveryBrief: contract.discoveryBrief,
          },
          null,
          2,
        ),
        "utf8",
      ),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(path.join(checkpointDir, "generation-contract.json"), JSON.stringify(contract, null, 2), "utf8"),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(
        path.join(checkpointDir, "site", "index.html"),
        "<!doctype html><html><body><header><nav><a href=\"/\">Home</a></nav></header><main><section class=\"masthead\"><div class=\"hero-grid\"><h1>CASUX</h1></div></section></main><footer>Footer</footer></body></html>",
        "utf8",
      ),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(path.join(checkpointDir, "site", "styles.css"), "body{color:black}", "utf8"),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(path.join(checkpointDir, "site", "script.js"), "console.log('ready')", "utf8"),
    );
    createSkillToolRouteUnitGenerationWorkerMock.mockReturnValue({
      id: "repair-worker",
      capabilities: ["route-unit"],
      runUnit: async (input: any) => ({
        unitId: input.unitId,
        status: "passed",
        files: [
          {
            path: "/index.html",
            content:
              "<!doctype html><html><body><header><nav><a href=\"/\">Home</a></nav></header><main><section class=\"institutional-masthead\"><h1>CASUX institution overview</h1><p>CASUX explains public standards, research, advocacy, certification, and consultation routes in one institution-led homepage.</p></section><section><h2>Capability overview</h2><p>Overview shelves and proof bands clarify the public scope.</p></section></main><footer>Footer</footer></body></html>",
          },
          { path: "/styles.css", content: "body{color:black}" },
          { path: "/script.js", content: "console.log('ready')" },
        ],
      }),
    });

    const { recoverWebsiteGenerationMvpFromCheckpoints } = await import("./website-generation-mvp");
    const recovered = await recoverWebsiteGenerationMvpFromCheckpoints({ outputDir });

    expect(recovered.previewOnly).toBe(false);
    expect(recovered.verification.status).toBe("passed");
    expect(createSkillToolRouteUnitGenerationWorkerMock).toHaveBeenCalledTimes(1);
  });

  it("synthesizes fallback route html when recovery is missing route files and repair cannot complete them", async () => {
    const outputDir = "D:/github/shpitto/apps/web/.tmp/website-generation-mvp-recover-synth-test";
    const checkpointDir = path.join(outputDir, "checkpoints");
    await import("node:fs/promises").then((fs) => fs.rm(outputDir, { recursive: true, force: true }));
    await import("node:fs/promises").then((fs) => fs.mkdir(path.join(checkpointDir, "site"), { recursive: true }));
    const { buildImmutableGenerationContract } = await import("../skill-runtime/generation-contract.ts");
    const contract = buildImmutableGenerationContract({
      generationLane: "website-generation-mvp",
      websiteSurfaceMode: "content-hub-site",
      promptControlManifest: {
        routes: ["/", "/casux-advocacy"],
        pageIntents: [
          { route: "/", navLabel: "Home", pageKind: "home", purpose: "Institutional homepage." },
          {
            route: "/casux-advocacy",
            navLabel: "Advocacy",
            pageKind: "intent",
            purpose: "Advocacy programs and participation.",
          },
        ],
      },
      discoveryBrief: {
        surfaceMode: "content-hub-site",
        routes: ["/", "/casux-advocacy"],
      },
      selectedSeedSkillManifest: {
        selected: [{ id: "content-hub-site", source: "shpitto" }],
      },
    });
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(path.join(outputDir, "canonical-prompt.md"), "# Canonical Prompt", "utf8"),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(
        path.join(outputDir, "prompt-draft-metadata.json"),
        JSON.stringify(
          {
            promptControlManifest: contract.promptControlManifest,
            discoveryBrief: contract.discoveryBrief,
          },
          null,
          2,
        ),
        "utf8",
      ),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(path.join(checkpointDir, "generation-contract.json"), JSON.stringify(contract, null, 2), "utf8"),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(
        path.join(checkpointDir, "site", "index.html"),
        "<!doctype html><html lang=\"zh-CN\"><body><header><nav><a href=\"/\" aria-current=\"page\">Home</a><a href=\"/casux-advocacy\">Advocacy</a></nav><button data-locale-toggle=\"true\">EN</button></header><main><section class=\"institutional-masthead\"><h1>CASUX institution overview</h1><p>CASUX provides public standards, certification, advocacy, and consultation guidance.</p></section><section><h2>Public pathways</h2><p>The homepage explains how certification, advocacy, and research connect.</p></section></main><footer><p>CASUX footer</p><a href=\"/casux-advocacy\">Advocacy</a></footer></body></html>",
        "utf8",
      ),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(path.join(checkpointDir, "site", "styles.css"), "body{color:black}", "utf8"),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(path.join(checkpointDir, "site", "script.js"), "console.log('ready')", "utf8"),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(
        path.join(checkpointDir, "route-home.input.json"),
        JSON.stringify(
          {
            route: "/",
            navLabel: "Home",
            pageKind: "home",
            purpose: "Institutional homepage.",
            htmlPath: "/index.html",
            localeFiles: ["/i18n/messages.en.json", "/i18n/messages.zh-CN.json"],
          },
          null,
          2,
        ),
        "utf8",
      ),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(
        path.join(checkpointDir, "route-casux-advocacy.input.json"),
        JSON.stringify(
          {
            route: "/casux-advocacy",
            navLabel: "Advocacy",
            pageKind: "intent",
            purpose: "Advocacy programs and participation.",
            htmlPath: "/casux-advocacy/index.html",
            openingTopology: "advocacy lead band -> participation network -> action framework",
            localeFiles: ["/i18n/messages.en.json", "/i18n/messages.zh-CN.json"],
          },
          null,
          2,
        ),
        "utf8",
      ),
    );
    await import("node:fs/promises").then((fs) =>
      fs.mkdir(path.join(checkpointDir, "site", "i18n"), { recursive: true }),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(path.join(checkpointDir, "site", "i18n", "messages.en.json"), "{\"home\":\"Home\"}", "utf8"),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(
        path.join(checkpointDir, "site", "i18n", "messages.zh-CN.json"),
        "{\"home\":\"首页\"}",
        "utf8",
      ),
    );
    createSkillToolRouteUnitGenerationWorkerMock.mockReturnValue({
      id: "repair-worker",
      capabilities: ["route-unit"],
      runUnit: async (input: any) => ({
        unitId: input.unitId,
        status: "failed",
        files: [],
        error: "provider timeout",
      }),
    });

    const { recoverWebsiteGenerationMvpFromCheckpoints } = await import("./website-generation-mvp");
    const recovered = await recoverWebsiteGenerationMvpFromCheckpoints({ outputDir });

    expect(recovered.previewOnly).toBe(false);
    expect(recovered.verification.status).toBe("passed");
    expect(recovered.generatedFiles).toContain("/casux-advocacy/index.html");
    const advocacyHtml = await import("node:fs/promises").then((fs) =>
      fs.readFile(path.join(outputDir, "site", "casux-advocacy", "index.html"), "utf8"),
    );
    expect(advocacyHtml).toContain("CASUX Advocacy");
    expect(advocacyHtml).toContain("提交机构咨询");
  });

  it("overwrites failed non-home routes with fallback html when recovered files still contain prompt leakage", async () => {
    const outputDir = "D:/github/shpitto/apps/web/.tmp/website-generation-mvp-recover-overwrite-test";
    const checkpointDir = path.join(outputDir, "checkpoints");
    await import("node:fs/promises").then((fs) => fs.rm(outputDir, { recursive: true, force: true }));
    await import("node:fs/promises").then((fs) =>
      fs.mkdir(path.join(checkpointDir, "site", "casux-advocacy"), { recursive: true }),
    );
    await import("node:fs/promises").then((fs) =>
      fs.mkdir(path.join(checkpointDir, "site", "i18n"), { recursive: true }),
    );
    const { buildImmutableGenerationContract } = await import("../skill-runtime/generation-contract.ts");
    const contract = buildImmutableGenerationContract({
      generationLane: "website-generation-mvp",
      websiteSurfaceMode: "content-hub-site",
      promptControlManifest: {
        routes: ["/", "/casux-advocacy"],
        pageIntents: [
          { route: "/", navLabel: "Home", pageKind: "home", purpose: "Institutional homepage." },
          {
            route: "/casux-advocacy",
            navLabel: "Advocacy",
            pageKind: "intent",
            purpose: "Advocacy programs and participation.",
          },
        ],
      },
      discoveryBrief: {
        surfaceMode: "content-hub-site",
        routes: ["/", "/casux-advocacy"],
      },
      selectedSeedSkillManifest: {
        selected: [{ id: "content-hub-site", source: "shpitto" }],
      },
    });
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(path.join(outputDir, "canonical-prompt.md"), "# Canonical Prompt", "utf8"),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(
        path.join(outputDir, "prompt-draft-metadata.json"),
        JSON.stringify(
          {
            promptControlManifest: contract.promptControlManifest,
            discoveryBrief: contract.discoveryBrief,
          },
          null,
          2,
        ),
        "utf8",
      ),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(path.join(checkpointDir, "generation-contract.json"), JSON.stringify(contract, null, 2), "utf8"),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(
        path.join(checkpointDir, "site", "index.html"),
        "<!doctype html><html lang=\"zh-CN\"><body><header><nav><a href=\"/\" aria-current=\"page\">Home</a><a href=\"/casux-advocacy\">Advocacy</a></nav><button data-locale-toggle=\"true\">EN</button></header><main><section class=\"institutional-masthead\"><h1>CASUX institution overview</h1><p>CASUX provides public standards, certification, advocacy, and consultation guidance.</p></section><section><h2>Public pathways</h2><p>The homepage explains how certification, advocacy, and research connect.</p></section></main><footer><p>CASUX footer</p><a href=\"/casux-advocacy\">Advocacy</a></footer></body></html>",
        "utf8",
      ),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(
        path.join(checkpointDir, "site", "casux-advocacy", "index.html"),
        "<!doctype html><html lang=\"zh-CN\"><body><header><nav><a href=\"/\">Home</a><a href=\"/casux-advocacy\" aria-current=\"page\">Advocacy</a></nav><button data-locale-toggle=\"true\">EN</button></header><main><p>Dedicated page for \"Advocacy\". Derive its content depth from the route intent.</p></main><footer><p>CASUX footer</p></footer></body></html>",
        "utf8",
      ),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(path.join(checkpointDir, "site", "styles.css"), "body{color:black}", "utf8"),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(path.join(checkpointDir, "site", "script.js"), "console.log('ready')", "utf8"),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(path.join(checkpointDir, "site", "i18n", "messages.en.json"), "{\"home\":\"Home\"}", "utf8"),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(
        path.join(checkpointDir, "site", "i18n", "messages.zh-CN.json"),
        "{\"home\":\"首页\"}",
        "utf8",
      ),
    );
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(
        path.join(checkpointDir, "route-casux-advocacy.input.json"),
        JSON.stringify(
          {
            route: "/casux-advocacy",
            navLabel: "Advocacy",
            pageKind: "intent",
            purpose: "Advocacy programs and participation.",
            htmlPath: "/casux-advocacy/index.html",
            openingTopology: "advocacy lead band -> participation network -> action framework",
            localeFiles: ["/i18n/messages.en.json", "/i18n/messages.zh-CN.json"],
          },
          null,
          2,
        ),
        "utf8",
      ),
    );
    createSkillToolRouteUnitGenerationWorkerMock.mockReturnValue({
      id: "repair-worker",
      capabilities: ["route-unit"],
      runUnit: async (input: any) => ({
        unitId: input.unitId,
        status: "failed",
        files: [],
        error: "provider timeout",
      }),
    });

    const { recoverWebsiteGenerationMvpFromCheckpoints } = await import("./website-generation-mvp");
    const recovered = await recoverWebsiteGenerationMvpFromCheckpoints({ outputDir });

    expect(recovered.previewOnly).toBe(false);
    expect(recovered.verification.status).toBe("passed");
    const advocacyHtml = await import("node:fs/promises").then((fs) =>
      fs.readFile(path.join(outputDir, "site", "casux-advocacy", "index.html"), "utf8"),
    );
    expect(advocacyHtml).not.toContain("Dedicated page for");
    expect(advocacyHtml).toContain("提交机构咨询");
  });
});
