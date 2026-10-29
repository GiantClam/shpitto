import assert from 'node:assert/strict';
import {test} from 'node:test';

import {createAssetDownloadToken, verifyAssetDownloadToken} from '../../src/modules/assets/authorize.ts';

const workspaceId = '00000000-0000-4000-8000-000000000941';
const assetId = '00000000-0000-4000-8000-000000000942';
const secret = 'asset-download-test-secret';
const now = new Date('2026-09-29T08:00:00.000Z');

test('asset download links bind the resource and expire at the 60-second boundary', () => {
  const {token} = createAssetDownloadToken(secret, workspaceId, assetId, now);
  assert.equal(verifyAssetDownloadToken(secret, token, workspaceId, assetId, new Date(now.getTime() + 59_999)), true);
  assert.equal(verifyAssetDownloadToken(secret, token, workspaceId, assetId, new Date(now.getTime() + 60_000)), false);
  assert.equal(verifyAssetDownloadToken(secret, token, workspaceId, '00000000-0000-4000-8000-000000000943', now), false);
  assert.equal(verifyAssetDownloadToken(secret, token, '00000000-0000-4000-8000-000000000944', assetId, now), false);
  assert.equal(verifyAssetDownloadToken(secret, `${token}$`, workspaceId, assetId, now), false);
});
