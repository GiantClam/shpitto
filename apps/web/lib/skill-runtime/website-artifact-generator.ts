import type { WebsiteSurfaceMode } from "./open-design-adoption.ts";

export type WebsiteArtifactGeneratorMode = "native" | "open-design" | "html-anything" | "hybrid";

const GENERATOR_MODES = new Set<WebsiteArtifactGeneratorMode>(["native", "open-design", "html-anything", "hybrid"]);

export function resolveWebsiteArtifactGeneratorMode(raw = process.env.SHPITTO_SITE_GENERATOR): WebsiteArtifactGeneratorMode {
  const normalized = String(raw || "").trim().toLowerCase();
  if (GENERATOR_MODES.has(normalized as WebsiteArtifactGeneratorMode)) return normalized as WebsiteArtifactGeneratorMode;
  return "hybrid";
}

export function websiteArtifactGeneratorEnablesImportedSkills(mode = resolveWebsiteArtifactGeneratorMode()): boolean {
  return mode === "open-design" || mode === "html-anything" || mode === "hybrid";
}

export type WebsiteSeedOrigin = "open-design" | "html-anything" | "shpitto";

export function classifyWebsiteSeedOrigin(params: { id?: string; rootDir?: string; skillMdPath?: string }): WebsiteSeedOrigin {
  const text = [params.id, params.rootDir, params.skillMdPath].map((item) => String(item || "").toLowerCase()).join("\n");
  if (text.includes("html-anything")) return "html-anything";
  if (text.includes("open-design")) return "open-design";
  return "shpitto";
}

export function scoreWebsiteSeedOriginForGenerator(params: {
  mode?: WebsiteArtifactGeneratorMode;
  origin: WebsiteSeedOrigin;
}): number {
  const mode = params.mode || resolveWebsiteArtifactGeneratorMode();
  if (mode === "native") return 0;
  if (mode === "hybrid") {
    if (params.origin === "open-design") return 14;
    if (params.origin === "html-anything") return 12;
    return 0;
  }
  if (mode === "open-design") return params.origin === "open-design" ? 24 : params.origin === "html-anything" ? 4 : 0;
  if (mode === "html-anything") return params.origin === "html-anything" ? 24 : params.origin === "open-design" ? 4 : 0;
  return 0;
}

export function renderWebsiteArtifactGeneratorContract(params: {
  mode?: WebsiteArtifactGeneratorMode;
  surfaceMode?: WebsiteSurfaceMode;
  selectedSeedSkillIds?: string[];
}): string {
  const mode = params.mode || resolveWebsiteArtifactGeneratorMode();
  const selectedSeedSkillIds = params.selectedSeedSkillIds || [];
  const ownerLine =
    mode === "hybrid"
      ? "Open Design owns visual direction and module rhythm; HTML Anything owns concrete HTML/CSS template discipline; Shpitto owns backend hooks, QA, preview, deploy, and DNS."
      : mode === "open-design"
        ? "Open Design owns visual direction, layout grammar, module rhythm, and visual QA expectations; Shpitto owns backend hooks, QA, preview, deploy, and DNS."
        : mode === "html-anything"
          ? "HTML Anything owns concrete HTML/CSS template discipline and route skeletons; Shpitto owns backend hooks, QA, preview, deploy, and DNS."
          : "Shpitto native generation owns frontend artifact generation plus backend hooks, QA, preview, deploy, and DNS.";
  return [
    "## Frontend Artifact Generator Contract",
    `- site_generator_mode: ${mode}`,
    `- website_surface_mode: ${params.surfaceMode || "auto"}`,
    `- frontend_generation_owner: ${ownerLine}`,
    mode === "native"
      ? "- imported_skill_policy: staged Open Design / HTML Anything imports remain opt-in sidecars unless rollout flags explicitly enable them."
      : "- imported_skill_policy: include compatible Open Design / HTML Anything website imports as primary frontend generation guidance before the model emits HTML/CSS.",
    mode === "native"
      ? "- functionality_port_scope: no external frontend generator is active for this run."
      : "- functionality_port_scope: port generation functionality, template discipline, route-unit structure, and QA checklists only; do not port external product chrome, account UI, admin panels, global app layout, or unrelated platform navigation.",
    "- shpitto_ui_theme_boundary: Shpitto Studio and platform UI keep the app theme from `apps/web/app/globals.css`, including `--shp-*` tokens and `.shp-*` shell classes. Open Design / HTML Anything imports must not override those globals or replace Shpitto's product UI shell.",
    "- generated_site_theme_boundary: generated customer websites may use their own route-level design tokens inside emitted `/styles.css`, but those tokens must stay inside generated artifacts and must not mutate Shpitto Studio, auth, project settings, deployment, or DNS UI.",
    "- shpitto_platform_boundary: after frontend artifacts are emitted, Shpitto remains responsible for Blog/content hooks, Contact/API wiring, static artifact materialization, route QA/repair, preview checkpoints, deployment, and DNS configuration.",
    selectedSeedSkillIds.length ? `- selected_frontend_seed_skills: ${selectedSeedSkillIds.join(", ")}` : "- selected_frontend_seed_skills: (none yet)",
  ].join("\n");
}
