import { getOwnedProjectState, saveProjectState } from "./agent/db";

export type ProjectContactSettings = {
  forwardTo: string[];
  sendUserAck: boolean;
  replyToField: string;
  brandName: string;
};

export type ProjectContactSettingsState = {
  settings: ProjectContactSettings;
  hasStoredSettings: boolean;
  hasStoredForwardTo: boolean;
  hasStoredSendUserAck: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function normalizeEmailList(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,;]+/g)
      : [];
  const deduped = new Set<string>();
  for (const item of values) {
    const normalized = normalizeText(item).toLowerCase();
    if (!normalized) continue;
    deduped.add(normalized);
  }
  return Array.from(deduped);
}

export function normalizeProjectContactSettings(
  input: unknown,
  fallbackBrandName?: string,
): ProjectContactSettings {
  const record = isRecord(input) ? input : {};
  return {
    forwardTo: normalizeEmailList(record.forwardTo),
    sendUserAck: record.sendUserAck == null ? true : Boolean(record.sendUserAck),
    replyToField: normalizeText(record.replyToField) || "email",
    brandName: normalizeText(record.brandName) || normalizeText(fallbackBrandName) || "Shpitto",
  };
}

function readRawContactSettings(projectJson: unknown) {
  const project = isRecord(projectJson) ? projectJson : {};
  const settings = isRecord(project.settings) ? project.settings : {};
  const contact = isRecord(settings.contact) ? settings.contact : {};
  const branding = isRecord(project.branding) ? project.branding : {};
  return {
    contact,
    settings,
    project,
    fallbackBrandName: normalizeText(branding.name) || "Shpitto",
    hasStoredSettings: isRecord(settings.contact),
    hasStoredForwardTo: Object.prototype.hasOwnProperty.call(contact, "forwardTo"),
    hasStoredSendUserAck: Object.prototype.hasOwnProperty.call(contact, "sendUserAck"),
  };
}

export function applyProjectContactSettingsToProjectJson(
  projectJson: unknown,
  settingsInput?: Partial<ProjectContactSettings> | null,
) {
  if (!settingsInput) return projectJson;

  const raw = readRawContactSettings(projectJson);
  const nextContact: Record<string, unknown> = { ...raw.contact };

  if (settingsInput.forwardTo !== undefined) {
    nextContact.forwardTo = normalizeEmailList(settingsInput.forwardTo);
  }
  if (settingsInput.sendUserAck !== undefined) {
    nextContact.sendUserAck = Boolean(settingsInput.sendUserAck);
  }
  if (settingsInput.replyToField !== undefined) {
    nextContact.replyToField = normalizeText(settingsInput.replyToField) || "email";
  }
  if (settingsInput.brandName !== undefined) {
    nextContact.brandName = normalizeText(settingsInput.brandName) || raw.fallbackBrandName;
  }

  return {
    ...raw.project,
    settings: {
      ...raw.settings,
      contact: nextContact,
    },
  };
}

export async function getProjectContactSettingsState(
  projectId: string,
  userId: string,
): Promise<ProjectContactSettingsState | null> {
  const state = await getOwnedProjectState(projectId, userId);
  if (!state) return null;
  const raw = readRawContactSettings(state.projectJson);
  return {
    settings: normalizeProjectContactSettings(raw.contact, raw.fallbackBrandName),
    hasStoredSettings: raw.hasStoredSettings,
    hasStoredForwardTo: raw.hasStoredForwardTo,
    hasStoredSendUserAck: raw.hasStoredSendUserAck,
  };
}

export async function getProjectContactSettings(projectId: string, userId: string): Promise<ProjectContactSettings | null> {
  const state = await getProjectContactSettingsState(projectId, userId);
  return state?.settings || null;
}

export async function updateProjectContactSettings(params: {
  projectId: string;
  userId: string;
  forwardTo?: string[] | string;
  sendUserAck?: boolean;
  replyToField?: string;
  brandName?: string;
}) {
  const state = await getOwnedProjectState(params.projectId, params.userId);
  if (!state) return null;

  const nextProjectJson = applyProjectContactSettingsToProjectJson(state.projectJson, {
    forwardTo: params.forwardTo,
    sendUserAck: params.sendUserAck,
    replyToField: params.replyToField,
    brandName: params.brandName,
  });

  await saveProjectState(params.userId, nextProjectJson, undefined, params.projectId);
  return getProjectContactSettings(params.projectId, params.userId);
}
