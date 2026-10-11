import assert from 'node:assert/strict';
import {describe, test} from 'node:test';

import {
  assertCurrentServerQuote,
  createServerQuote,
  DEFAULT_MODEL_ID,
  getCatalogVersion,
  getModelCatalog,
} from '../../src/config/models.ts';
import {
  canonicalJson,
  commandKeyFromRequest,
  failure,
  hasTrustedMutationOrigin,
  parseDecimalInteger,
  parseIdempotencyKey,
  parseJsonObject,
  semanticHash,
  serializeJsonValue,
  success,
} from '../../src/contracts/http.ts';
import {DomainError, type DomainErrorCode} from '../../src/db/contracts.ts';
import {commandPayload} from '../../src/modules/shared/commands.ts';

const rejectsCode = (code: DomainErrorCode) => (error: unknown): boolean => error instanceof DomainError && error.code === code;
const appUrl = 'https://app.example.test/deployment/path';
const fixedNow = new Date('2026-09-29T08:00:00.000Z');

function mutation(headers: HeadersInit = {}, method = 'POST'): Request {
  return new Request('https://app.example.test/api/workspaces', {method, headers});
}

describe('session HTTP contracts', () => {
  test('envelopes retain payload and expose only the supplied safe error', () => {
    const payload = {balance: '9007199254740993', currency: 'USD'};
    assert.deepEqual(success(payload), {ok: true, data: payload});
    assert.deepEqual(failure('FORBIDDEN', 'Workspace is not available.'), {
      ok: false,
      error: {code: 'FORBIDDEN', message: 'Workspace is not available.'},
    });
  });

  test('JSON bodies accept objects and empty input while rejecting other JSON shapes', () => {
    assert.deepEqual(parseJsonObject(' \n\t'), {});
    assert.deepEqual(parseJsonObject('{"name":"Team","metadata":{"enabled":true}}'), {name: 'Team', metadata: {enabled: true}});
    for (const raw of ['{', 'null', 'false', '42', '"text"', '[]']) {
      assert.throws(() => parseJsonObject(raw), rejectsCode('VALIDATION'), `Accepted invalid object body: ${raw}`);
    }
  });

  test('idempotency keys enforce ASCII character and length bounds', () => {
    for (const value of ['a', 'ABC_123-foo.bar~', 'a'.repeat(128)]) assert.equal(parseIdempotencyKey(value), value);
    for (const value of [undefined, null, 123, '', 'a'.repeat(129), 'contains space', 'slash/key', '非ASCII']) {
      assert.throws(() => parseIdempotencyKey(value), rejectsCode('VALIDATION'));
    }
  });

  test('decimal quantities preserve arbitrarily large exact integers', () => {
    for (const value of ['0', '1', '90071992547409931234567890']) assert.equal(parseDecimalInteger(value), value);
    for (const value of [1, 1n, undefined, '', '-1', '+1', '01', '1.1', '1e3', ' 1']) {
      assert.throws(() => parseDecimalInteger(value, 'credits'), rejectsCode('VALIDATION'));
    }
    assert.throws(() => parseDecimalInteger('-1', 'credits'), (error: unknown) => rejectsCode('VALIDATION')(error) && error instanceof DomainError && error.publicMessage.startsWith('credits '));
  });

  test('serialization recursively preserves quantities and UTC timestamps', () => {
    const input = {credits: 9007199254740993n, at: fixedNow, nested: [0n, {active: true, text: 'hello'}, null], missing: undefined};
    assert.deepEqual(serializeJsonValue(input), {
      credits: '9007199254740993',
      at: '2026-09-29T08:00:00.000Z',
      nested: ['0', {active: true, text: 'hello'}, null],
      missing: undefined,
    });
    assert.equal(input.credits, 9007199254740993n);
    assert.equal(input.at, fixedNow);
    assert.equal(serializeJsonValue(false), false);
    assert.equal(serializeJsonValue(3), 3);
  });

  test('canonical identity sorts object keys, preserves array order and rejects unsupported values', () => {
    assert.equal(canonicalJson({z: [true, null, 3], a: {z: 2, a: 'text'}}), '{"a":{"a":"text","z":2},"z":[true,null,3]}');
    assert.equal(canonicalJson([123n, fixedNow]), '["123","2026-09-29T08:00:00.000Z"]');
    const first = semanticHash('workspace.create', {name: 'Team', data: {b: 2, a: 1}});
    assert.match(first, /^[a-f0-9]{64}$/);
    assert.equal(first, semanticHash('workspace.create', {data: {a: 1, b: 2}, name: 'Team'}));
    assert.notEqual(first, semanticHash('workspace.rename', {name: 'Team', data: {b: 2, a: 1}}));
    assert.notEqual(first, semanticHash('workspace.create', {name: 'Other', data: {b: 2, a: 1}}));
    assert.notEqual(semanticHash('command', [1, 2]), semanticHash('command', [2, 1]));
    for (const invalid of [undefined, () => 1, Symbol('invalid'), {nested: undefined}]) {
      assert.throws(() => canonicalJson(invalid), rejectsCode('VALIDATION'));
    }
    const payload = {name: 'Team', quantities: [2n]};
    assert.deepEqual(commandPayload(payload), payload);
    assert.throws(() => commandPayload({unsupported: undefined}), rejectsCode('VALIDATION'));
  });

  test('request command identity accepts matching sources and rejects conflicts or missing keys', () => {
    assert.equal(commandKeyFromRequest(mutation({'idempotency-key': 'header-key'}), {}), 'header-key');
    assert.equal(commandKeyFromRequest(mutation(), {idempotencyKey: 'body-key'}), 'body-key');
    assert.equal(commandKeyFromRequest(mutation({'idempotency-key': 'same-key'}), {idempotencyKey: 'same-key'}), 'same-key');
    assert.throws(() => commandKeyFromRequest(mutation({'idempotency-key': 'one'}), {idempotencyKey: 'two'}), rejectsCode('CONFLICT'));
    assert.throws(() => commandKeyFromRequest(mutation({'idempotency-key': 'one'}), {idempotencyKey: 1}), rejectsCode('CONFLICT'));
    assert.throws(() => commandKeyFromRequest(mutation(), {}), rejectsCode('VALIDATION'));
    assert.throws(() => commandKeyFromRequest(mutation({'idempotency-key': ''}), {idempotencyKey: 'fallback'}), rejectsCode('VALIDATION'));
  });

  test('mutations require a matching origin or a valid same-origin referer', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      assert.equal(hasTrustedMutationOrigin(mutation({origin: 'https://app.example.test'}, method), appUrl), true);
      assert.equal(hasTrustedMutationOrigin(mutation({origin: 'https://attacker.example.test'}, method), appUrl), false);
      assert.equal(hasTrustedMutationOrigin(mutation({}, method), appUrl), false);
    }
    assert.equal(hasTrustedMutationOrigin(mutation({referer: 'https://app.example.test/workspaces?id=1'}), appUrl), true);
    assert.equal(hasTrustedMutationOrigin(mutation({referer: 'https://app.example.test:444/workspaces'}), appUrl), false);
    assert.equal(hasTrustedMutationOrigin(mutation({referer: 'invalid-url'}), appUrl), false);
    assert.equal(hasTrustedMutationOrigin(mutation({origin: 'https://attacker.example.test', referer: 'https://app.example.test/'}), appUrl), false);
    assert.equal(hasTrustedMutationOrigin(mutation({origin: 'https://app.example.test'}), 'invalid-app-url'), false);
    assert.equal(hasTrustedMutationOrigin(mutation({origin: 'null'}), appUrl), false);
    for (const method of ['GET', 'HEAD', 'OPTIONS']) assert.equal(hasTrustedMutationOrigin(mutation({}, method), appUrl), true);
  });
});

describe('server-owned model quotes', () => {
  test('local and test catalogs remain isolated from the disabled production mock', () => {
    assert.equal(getModelCatalog().get(DEFAULT_MODEL_ID)?.creditsPerUnit, 10n);
    assert.equal(getModelCatalog('test').get(DEFAULT_MODEL_ID)?.maxQuantity, 1000n);
    assert.equal(getModelCatalog('production').size, 0);
    assert.equal(getCatalogVersion(), 1);
    assert.equal(Object.isFrozen(getModelCatalog().get(DEFAULT_MODEL_ID)), true);
  });

  test('quotes use the server price, bounded quantities and a deterministic supplied clock', () => {
    const quote = createServerQuote(DEFAULT_MODEL_ID, '3', {profile: 'test', now: fixedNow});
    assert.deepEqual({...quote, quoteHash: '<hash>'}, {
      modelId: DEFAULT_MODEL_ID,
      catalogVersion: 1,
      quantity: '3',
      unitCost: '10',
      totalCost: '30',
      issuedAt: '2026-09-29T08:00:00.000Z',
      quoteHash: '<hash>',
    });
    assert.match(quote.quoteHash, /^[a-f0-9]{64}$/);
    assert.equal(Object.isFrozen(quote), true);
    assert.equal(assertCurrentServerQuote(quote, 'test').id, DEFAULT_MODEL_ID);
    assert.equal(createServerQuote(DEFAULT_MODEL_ID, '1000', {now: fixedNow}).totalCost, '10000');
    assert.equal(assertCurrentServerQuote(createServerQuote(DEFAULT_MODEL_ID, '1')).creditsPerUnit, 10n);
  });

  test('creation rejects invalid quantities and unavailable catalog entries', () => {
    for (const quantity of ['0', '-1', '+1', '1.5', '1e3', '', '1001', '99999999999999999999']) {
      assert.throws(() => createServerQuote(DEFAULT_MODEL_ID, quantity), rejectsCode('VALIDATION'));
    }
    assert.throws(() => createServerQuote('missing-model', '1'), rejectsCode('CONFLICT'));
    assert.throws(() => createServerQuote(DEFAULT_MODEL_ID, '1', {profile: 'production'}), rejectsCode('CONFLICT'));
  });

  test('validation rejects stale versions, production mock use and tampered monetary fields', () => {
    const quote = createServerQuote(DEFAULT_MODEL_ID, '3', {now: fixedNow});
    assert.throws(() => assertCurrentServerQuote(quote, 'production'), rejectsCode('CONFLICT'));
    for (const mutation of [{modelId: 'missing-model'}, {catalogVersion: 0}, {unitCost: '1'}, {totalCost: '1'}, {quantity: '4'}, {issuedAt: '2026-09-30T08:00:00.000Z'}, {quoteHash: '0'.repeat(64)}]) {
      assert.throws(() => assertCurrentServerQuote({...quote, ...mutation}), rejectsCode('CONFLICT'));
    }
    for (const mutation of [{quantity: 'invalid'}, {unitCost: '-1'}, {totalCost: '1.5'}, {quantity: '0'}, {quantity: '1001'}]) {
      assert.throws(() => assertCurrentServerQuote({...quote, ...mutation}), rejectsCode('VALIDATION'));
    }
  });
});
