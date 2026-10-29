import {selectGenerationModel, type GenerationModelChoice} from './crop-consent.ts';

export const CREATION_DRAFT_KEY = 'shpitto.creation-draft.v1';
export type CreationDraft = Readonly<{version: 1; prompt: string; mode: 'text-to-video' | 'image-to-video'; aspectRatio: '16:9' | '9:16'}>;
type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function validatedDraft(value: unknown): CreationDraft | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const draft = value as Record<string, unknown>;
  if (draft.version !== 1 || typeof draft.prompt !== 'string' || draft.prompt.length > 10000
    || (draft.mode !== 'text-to-video' && draft.mode !== 'image-to-video')
    || (draft.aspectRatio !== '16:9' && draft.aspectRatio !== '9:16')) return null;
  return {version: 1, prompt: draft.prompt, mode: draft.mode, aspectRatio: draft.aspectRatio};
}

export function parseCreationDraft(raw: string | null): CreationDraft | null {
  if (typeof raw !== 'string') return null;
  try {return validatedDraft(JSON.parse(raw));}
  catch {return null;}
}

/** Pass sessionStorage; the handoff is scoped to the current browser tab. */
export function saveCreationDraft(storage: DraftStorage | null | undefined, draft: CreationDraft): boolean {
  try {
    const safeDraft = validatedDraft(draft);
    if (!storage || !safeDraft) return false;
    storage.setItem(CREATION_DRAFT_KEY, JSON.stringify(safeDraft));
    return true;
  } catch {return false;}
}

export function readCreationDraft(storage: DraftStorage | null | undefined): CreationDraft | null {
  try {
    const raw = storage?.getItem(CREATION_DRAFT_KEY) ?? null;
    const draft = parseCreationDraft(raw);
    if (raw !== null && !draft) clearCreationDraft(storage);
    return draft;
  } catch {return null;}
}

export function clearCreationDraft(storage: DraftStorage | null | undefined): boolean {
  try {
    if (!storage) return false;
    storage.removeItem(CREATION_DRAFT_KEY);
    return true;
  } catch {return false;}
}
/** Choices must come from the current server-admitted catalog, never from the draft. */
export function selectCreationDraftModel(draft: CreationDraft, choices: readonly GenerationModelChoice[]): GenerationModelChoice | null {
  return selectGenerationModel(choices, draft.mode);
}
