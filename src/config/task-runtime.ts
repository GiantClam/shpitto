export type TaskRuntime = 'self_hosted' | 'trigger';

export type TaskRuntimeConfig = Readonly<{
  mode: TaskRuntime;
  triggerProjectRef: string;
  triggerSecretKey: string;
}>;

export function parseTaskRuntime(input: Readonly<{mode: string; triggerProjectRef: string; triggerSecretKey: string}>): TaskRuntimeConfig {
  const mode = input.mode || 'self_hosted';
  if (mode !== 'self_hosted' && mode !== 'trigger') throw new Error('TASK_RUNTIME must be self_hosted or trigger.');
  if (mode === 'trigger' && (!input.triggerProjectRef || !input.triggerSecretKey)) {
    throw new Error('Trigger task runtime requires TRIGGER_PROJECT_REF and TRIGGER_SECRET_KEY.');
  }
  // Helpers alone are not an executable hosted integration. Never accept a
  // configuration that would silently leave the authoritative outbox idle.
  if (mode === 'trigger') throw new Error('TASK_RUNTIME=trigger is not available in this build; use self_hosted until scoped task registration and deployment are verified.');
  return Object.freeze({mode, triggerProjectRef: '', triggerSecretKey: ''});
}
