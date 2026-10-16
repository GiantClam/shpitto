import {assertPrivateRailwayWorkerDatabase} from './provider-worker.ts';
import type {RecoveryAlertConfig} from '../modules/operations/recovery-alert-delivery.ts';

type Input = RecoveryAlertConfig & Readonly<{mode: string; databaseUrl: string}>;
export function parseRecoveryMonitorConfig(input: Input): Input & Readonly<{mode: 'off' | 'observe'}> {
  if (input.profile !== 'acceptance' || !input.projectId || input.projectId !== input.expectedProjectId) throw new Error('Recovery monitor requires its isolated acceptance project binding.');
  if (!['off', 'observe'].includes(input.mode)) throw new Error('Recovery monitor mode must be off or observe.');
  if (input.mode === 'observe') {
    assertPrivateRailwayWorkerDatabase(input.databaseUrl);
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.workspaceId) ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(input.workerKey) || input.secret.length < 32) throw new Error('Recovery monitor requires an assigned scope and dedicated alert secret.');
    const url = new URL(input.alertUrl);
    if (url.protocol !== 'https:' || url.origin !== new URL(input.appUrl).origin || url.pathname !== '/api/internal/recovery-alerts' || url.username || url.password || url.search || url.hash) throw new Error('Recovery monitor requires the assigned application HTTPS recipient.');
  }
  return Object.freeze({...input, mode: input.mode as 'off' | 'observe'});
}
