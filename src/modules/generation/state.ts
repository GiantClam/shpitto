import {DomainError} from '../../db/contracts.ts';

export type GenerationTaskStatus =
  | 'queued'
  | 'dispatching'
  | 'submission_unknown'
  | 'submitted'
  | 'running'
  | 'materializing'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export const TERMINAL_GENERATION_STATES: ReadonlySet<GenerationTaskStatus> = new Set([
  'succeeded',
  'failed',
  'cancelled',
]);

const TRANSITIONS: Readonly<Record<GenerationTaskStatus, ReadonlySet<GenerationTaskStatus>>> = {
  queued: new Set(['dispatching', 'cancelled', 'failed']),
  dispatching: new Set(['submission_unknown', 'submitted', 'failed']),
  submission_unknown: new Set(['submitted', 'running', 'materializing', 'failed']),
  submitted: new Set(['running', 'materializing', 'failed']),
  running: new Set(['materializing', 'failed']),
  materializing: new Set(['succeeded', 'failed']),
  succeeded: new Set(),
  failed: new Set(),
  cancelled: new Set(),
};

export function isTerminalGenerationState(status: GenerationTaskStatus): boolean {
  return TERMINAL_GENERATION_STATES.has(status);
}

export function canTransitionGenerationTask(
  from: GenerationTaskStatus,
  to: GenerationTaskStatus,
): boolean {
  return from === to || TRANSITIONS[from].has(to);
}

export function assertGenerationTaskTransition(
  from: GenerationTaskStatus,
  to: GenerationTaskStatus,
): void {
  if (!canTransitionGenerationTask(from, to)) {
    throw new DomainError('CONFLICT', `Generation task cannot transition from ${from} to ${to}.`);
  }
}

export type GenerationTaskState = Readonly<{
  status: GenerationTaskStatus;
  version: number;
  failureCode: string | null;
  updatedAt: Date;
}>;

/**
 * Pure transition guard shared by HTTP commands and future worker commands.
 * It never reopens a terminal task and always advances the optimistic version.
 */
export function transitionGenerationTask(
  task: GenerationTaskState,
  next: GenerationTaskStatus,
  options: Readonly<{now?: Date; failureCode?: string}> = {},
): GenerationTaskState {
  assertGenerationTaskTransition(task.status, next);
  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new DomainError('VALIDATION', 'A valid transition timestamp is required.');
  if (next === 'failed' && !options.failureCode?.trim()) {
    throw new DomainError('VALIDATION', 'A failure code is required for a failed generation task.');
  }
  if (next !== 'failed' && options.failureCode !== undefined) {
    throw new DomainError('VALIDATION', 'A failure code is only valid for failed tasks.');
  }
  return Object.freeze({
    status: next,
    version: task.version + (next === task.status ? 0 : 1),
    failureCode: next === 'failed' ? options.failureCode!.trim() : task.failureCode,
    updatedAt: now,
  });
}
