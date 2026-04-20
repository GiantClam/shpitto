import type { AgentState } from "../agent/graph.ts";
import { resolveRunProviderLock, type ProviderLock } from "./provider-lock.ts";

export type RunProviderLock = ProviderLock;

export function resolveRunProviderRunnerLock(preferred?: {
  provider?: string;
  model?: string;
}): RunProviderLock {
  return resolveRunProviderLock(preferred);
}

export function bindRunProviderLockToState(state: AgentState, lock: RunProviderLock): AgentState {
  return {
    ...state,
    workflow_context: {
      ...(state.workflow_context || {}),
      lockedProvider: lock.provider,
      lockedModel: lock.model,
    } as any,
  };
}

