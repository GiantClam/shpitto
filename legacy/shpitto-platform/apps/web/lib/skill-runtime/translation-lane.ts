import { buildLocalePlan, getLocaleMessagePath, I18N_LOCALE_REGISTRY_PATH } from "./locale-plan.ts";

type TranslationLaneRegistry = {
  defaultLocale?: string;
  locales?: string[];
  translationDriven?: boolean;
  sourceCatalog?: string;
};

export type TranslationLanePlan = {
  defaultLocale: string;
  supportedLocales: string[];
  targetLocales: string[];
  sourceCatalogPath: string;
  sourceMessages: Record<string, string>;
};

export type TranslationCatalogDraft = {
  messages: Record<string, string>;
  translated: boolean;
  note?: string;
};

export type TranslationLaneResult = {
  project: any;
  changedFiles: string[];
  validationReport: {
    defaultLocale: string;
    supportedLocales: string[];
    targetLocales: string[];
    sourceCatalogPath: string;
    sourceKeyCount: number;
    translatedLocales: string[];
    fallbackLocales: string[];
    missingKeyFillCount: number;
    notes: string[];
  };
};

function normalizePath(value: string): string {
  const raw = String(value || "").trim().replace(/\\/g, "/");
  if (!raw) return "/";
  return (raw.startsWith("/") ? raw : `/${raw}`).replace(/\/{2,}/g, "/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function tryParseJsonObject(input: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(String(input || ""));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function normalizeLocaleCode(value: unknown): string | undefined {
  const raw = String(value || "").trim().replace(/_/g, "-");
  if (!raw) return undefined;
  if (/^[a-z]{2,3}$/i.test(raw)) {
    const base = raw.toLowerCase();
    if (base === "zh") return "zh-CN";
    if (base === "en") return "en";
    return base;
  }
  if (/^[a-z]{2,3}-[a-z]{2,4}$/i.test(raw)) {
    const [base, region] = raw.split("-");
    if (base.toLowerCase() === "zh") return "zh-CN";
    if (base.toLowerCase() === "en") return "en";
    return `${base.toLowerCase()}-${region.toUpperCase()}`;
  }
  return undefined;
}

function normalizeLocaleList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((item) => normalizeLocaleCode(item))
        .filter((item): item is string => Boolean(item)),
    ),
  );
}

function normalizeMessageCatalog(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [String(key || "").trim(), String(item || "").trim()] as const)
      .filter(([key]) => Boolean(key)),
  );
}

function cloneProject<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getStaticSiteFiles(project: any): Array<{ path: string; type: string; content: string }> {
  return Array.isArray(project?.staticSite?.files) ? project.staticSite.files : [];
}

function fileMap(project: any): Map<string, { path: string; type: string; content: string }> {
  return new Map(
    getStaticSiteFiles(project).map((file) => [normalizePath(String(file.path || "")), file] as const),
  );
}

function upsertProjectFile(
  project: any,
  file: { path: string; type: string; content: string },
  changedFiles: Set<string>,
): void {
  if (!project.staticSite || !Array.isArray(project.staticSite.files)) {
    project.staticSite = {
      ...(project.staticSite || {}),
      files: [],
    };
  }
  const normalizedPath = normalizePath(file.path);
  const nextFile = {
    path: normalizedPath,
    type: file.type,
    content: file.content,
  };
  const existingIndex = project.staticSite.files.findIndex(
    (item: any) => normalizePath(String(item?.path || "")) === normalizedPath,
  );
  const existingContent =
    existingIndex >= 0 ? JSON.stringify(project.staticSite.files[existingIndex]) : "";
  const nextContent = JSON.stringify(nextFile);
  if (existingIndex >= 0) {
    project.staticSite.files[existingIndex] = nextFile;
  } else {
    project.staticSite.files.push(nextFile);
  }
  if (existingContent !== nextContent) changedFiles.add(normalizedPath);
}

function resolveRegistry(project: any): TranslationLaneRegistry | undefined {
  const registryFile = fileMap(project).get(I18N_LOCALE_REGISTRY_PATH);
  const parsed = tryParseJsonObject(String(registryFile?.content || ""));
  if (!parsed) return undefined;
  return {
    defaultLocale: normalizeLocaleCode(parsed.defaultLocale),
    locales: normalizeLocaleList(parsed.locales),
    translationDriven: Boolean(parsed.translationDriven),
    sourceCatalog: normalizePath(String(parsed.sourceCatalog || "")),
  };
}

function resolveWorkflowRequirementSpec(workflowContext?: Record<string, unknown>): Record<string, unknown> {
  return isRecord(workflowContext?.requirementSpec) ? (workflowContext?.requirementSpec as Record<string, unknown>) : {};
}

function resolveSourceMessages(
  project: any,
  sourceCatalogPath: string,
  defaultLocale: string,
): Record<string, string> {
  const files = fileMap(project);
  const explicitSource = normalizeMessageCatalog(
    tryParseJsonObject(String(files.get(sourceCatalogPath)?.content || "")),
  );
  if (Object.keys(explicitSource).length > 0) return explicitSource;
  const fallbackSource = normalizeMessageCatalog(
    tryParseJsonObject(String(files.get(getLocaleMessagePath(defaultLocale))?.content || "")),
  );
  return fallbackSource;
}

function resolveDefaultLocale(params: {
  workflowContext?: Record<string, unknown>;
  registry?: TranslationLaneRegistry;
  instructionText: string;
}): string {
  const requirementSpec = resolveWorkflowRequirementSpec(params.workflowContext);
  return (
    normalizeLocaleCode(params.workflowContext?.defaultLocale) ||
    normalizeLocaleCode(requirementSpec.defaultLocale) ||
    normalizeLocaleCode(params.registry?.defaultLocale) ||
    buildLocalePlan(params.instructionText, normalizeLocaleCode(requirementSpec.defaultLocale) || undefined).defaultLocale
  );
}

function resolveSupportedLocales(params: {
  workflowContext?: Record<string, unknown>;
  registry?: TranslationLaneRegistry;
  instructionText: string;
  defaultLocale: string;
}): string[] {
  const requirementSpec = resolveWorkflowRequirementSpec(params.workflowContext);
  const workflowLocales = normalizeLocaleList(params.workflowContext?.supportedLocales);
  const specLocales = normalizeLocaleList(requirementSpec.supportedLocales);
  const registryLocales = normalizeLocaleList(params.registry?.locales);
  const fallbackPlan = buildLocalePlan(params.instructionText, params.defaultLocale);
  const resolved = workflowLocales.length
    ? workflowLocales
    : specLocales.length
      ? specLocales
      : registryLocales.length
        ? registryLocales
        : fallbackPlan.locales;
  return Array.from(new Set([params.defaultLocale, ...resolved.filter(Boolean)]));
}

function resolveTargetLocales(params: {
  workflowContext?: Record<string, unknown>;
  supportedLocales: string[];
  defaultLocale: string;
}): string[] {
  const explicit = normalizeLocaleList(params.workflowContext?.translationTargetLocales);
  const target = explicit.length > 0 ? explicit : params.supportedLocales.filter((item) => item !== params.defaultLocale);
  return target.filter((item) => item !== params.defaultLocale);
}

export function resolveTranslationLanePlan(params: {
  project: any;
  instructionText: string;
  workflowContext?: Record<string, unknown>;
}): TranslationLanePlan | null {
  const registry = resolveRegistry(params.project);
  const defaultLocale = resolveDefaultLocale({
    workflowContext: params.workflowContext,
    registry,
    instructionText: params.instructionText,
  });
  const supportedLocales = resolveSupportedLocales({
    workflowContext: params.workflowContext,
    registry,
    instructionText: params.instructionText,
    defaultLocale,
  });
  const targetLocales = resolveTargetLocales({
    workflowContext: params.workflowContext,
    supportedLocales,
    defaultLocale,
  });
  const sourceCatalogPath = normalizePath(
    String(params.workflowContext?.translationSourceCatalogPath || registry?.sourceCatalog || getLocaleMessagePath(defaultLocale)),
  );
  const sourceMessages = resolveSourceMessages(params.project, sourceCatalogPath, defaultLocale);
  if (Object.keys(sourceMessages).length === 0) return null;
  return {
    defaultLocale,
    supportedLocales,
    targetLocales,
    sourceCatalogPath,
    sourceMessages,
  };
}

export async function applyTranslationLane(params: {
  project: any;
  plan: TranslationLanePlan;
  translateCatalog?: (args: {
    targetLocale: string;
    defaultLocale: string;
    sourceMessages: Record<string, string>;
    existingMessages: Record<string, string>;
  }) => Promise<TranslationCatalogDraft | null>;
}): Promise<TranslationLaneResult> {
  const nextProject = cloneProject(params.project);
  const changedFiles = new Set<string>();
  const files = fileMap(nextProject);
  const notes: string[] = [];
  const translatedLocales: string[] = [];
  const fallbackLocales: string[] = [];
  let missingKeyFillCount = 0;

  upsertProjectFile(
    nextProject,
    {
      path: params.plan.sourceCatalogPath,
      type: "application/json",
      content: JSON.stringify(params.plan.sourceMessages, null, 2),
    },
    changedFiles,
  );

  upsertProjectFile(
    nextProject,
    {
      path: I18N_LOCALE_REGISTRY_PATH,
      type: "application/json",
      content: JSON.stringify(
        {
          defaultLocale: params.plan.defaultLocale,
          locales: params.plan.supportedLocales,
          translationDriven: params.plan.supportedLocales.length > 2,
          sourceCatalog: params.plan.sourceCatalogPath,
        },
        null,
        2,
      ),
    },
    changedFiles,
  );

  for (const targetLocale of params.plan.targetLocales) {
    const targetPath = getLocaleMessagePath(targetLocale);
    const existingMessages = normalizeMessageCatalog(
      tryParseJsonObject(String(files.get(targetPath)?.content || "")),
    );
    const translatedDraft = params.translateCatalog
      ? await params.translateCatalog({
          targetLocale,
          defaultLocale: params.plan.defaultLocale,
          sourceMessages: params.plan.sourceMessages,
          existingMessages,
        })
      : null;
    const translatedMessages = normalizeMessageCatalog(translatedDraft?.messages);
    const mergedEntries = Object.keys(params.plan.sourceMessages).map((key) => {
      const translated = String(translatedMessages[key] || "").trim();
      const existing = String(existingMessages[key] || "").trim();
      const fallback = String(params.plan.sourceMessages[key] || "").trim();
      const value = translated || existing || fallback;
      if (!translated && !existing) missingKeyFillCount += 1;
      return [key, value] as const;
    });
    const mergedMessages = Object.fromEntries(mergedEntries);
    upsertProjectFile(
      nextProject,
      {
        path: targetPath,
        type: "application/json",
        content: JSON.stringify(mergedMessages, null, 2),
      },
      changedFiles,
    );
    if (translatedDraft?.translated) translatedLocales.push(targetLocale);
    else fallbackLocales.push(targetLocale);
    if (translatedDraft?.note) notes.push(`${targetLocale}: ${translatedDraft.note}`);
  }

  return {
    project: nextProject,
    changedFiles: Array.from(changedFiles).sort((a, b) => a.localeCompare(b)),
    validationReport: {
      defaultLocale: params.plan.defaultLocale,
      supportedLocales: params.plan.supportedLocales,
      targetLocales: params.plan.targetLocales,
      sourceCatalogPath: params.plan.sourceCatalogPath,
      sourceKeyCount: Object.keys(params.plan.sourceMessages).length,
      translatedLocales,
      fallbackLocales,
      missingKeyFillCount,
      notes,
    },
  };
}
