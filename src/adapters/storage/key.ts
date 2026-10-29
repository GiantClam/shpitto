import {DomainError} from '../../db/contracts.ts';

export function assertObjectKey(key: string): void {
  if (!key || key.length > 512 || key.includes('\\') || key.startsWith('/') || key.includes('\0')) {
    throw new DomainError('VALIDATION', 'Asset object key is invalid.');
  }
  const segments = key.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || !/^[A-Za-z0-9._-]+$/.test(segment))) {
    throw new DomainError('VALIDATION', 'Asset object key is invalid.');
  }
}
