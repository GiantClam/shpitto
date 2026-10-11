import assert from 'node:assert/strict';
import {test} from 'node:test';

import {DomainError} from '../../src/db/contracts.ts';
import {validateInputImageBytes} from '../../src/modules/assets/validate-input.ts';

const validPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9ioAAAAASUVORK5CYII=', 'base64');

function isValidationError(error: unknown): boolean {
  return error instanceof DomainError && error.code === 'VALIDATION';
}

test('input image validation decodes a bounded PNG', async () => {
  await assert.doesNotReject(() => validateInputImageBytes(validPng, 'image/png'));
});

test('input image validation rejects signature-only, spoofed, oversized and non-image inputs', async () => {
  await assert.rejects(validateInputImageBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'), isValidationError);
  await assert.rejects(validateInputImageBytes(validPng, 'image/jpeg'), isValidationError);
  await assert.rejects(validateInputImageBytes(new Uint8Array(20 * 1024 * 1024 + 1), 'image/png'), isValidationError);
  await assert.rejects(validateInputImageBytes(validPng, 'video/mp4'), isValidationError);
});
