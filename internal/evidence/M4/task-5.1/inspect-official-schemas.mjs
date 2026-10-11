import {createHash} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';

const destination = new URL('../../../contracts/providers/', import.meta.url);
await mkdir(destination, {recursive: true});
const rows = [
  {key: 'replicate-wan22-t2v', provider: 'replicate', endpoint: 'wan-video/wan-2.2-t2v-fast', version: 'c483b1f7b892065bc58ebadb6381abf557f6b1f517d2ff0febb3fb635cf49b4d'},
  {key: 'replicate-wan22-i2v', provider: 'replicate', endpoint: 'wan-video/wan-2.2-i2v-fast', version: '4eaf2b01d3bf70d8a2e00b219efeb7cb415855ad18b7dacdc4cae664a73a6eea'},
  {key: 'fal-wan22-t2v', provider: 'fal', endpoint: 'fal-ai/wan/v2.2-a14b/text-to-video'},
  {key: 'fal-wan22-i2v', provider: 'fal', endpoint: 'fal-ai/wan/v2.2-a14b/image-to-video'},
];
const manifest = [];
for (const row of rows) {
  const replicateToken = process.env.REPLICATE_API_TOKEN?.trim();
  const url = row.provider === 'replicate'
    ? replicateToken ? `https://api.replicate.com/v1/models/${row.endpoint}` : `https://replicate.com/${row.endpoint}`
    : `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${row.endpoint}`;
  const response = await fetch(url, {headers: row.provider === 'replicate' && replicateToken ? {Authorization: `Bearer ${replicateToken}`} : {}, signal: AbortSignal.timeout(25000)});
  if (!response.ok) throw new Error(`Public schema inspection failed: ${row.key} HTTP ${response.status}`);
  const body = await response.text();
  let schema;
  let observedVersion = null;
  if (row.provider === 'replicate') {
    if (replicateToken) {
      const model = JSON.parse(body);
      const version = model.latest_version;
      if (version?.id !== row.version) throw new Error(`Latest authenticated Replicate version does not match pinned contract: ${row.key}`);
      schema = version.openapi_schema;
      observedVersion = version.id;
    } else {
      for (const script of body.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
        let parsed;
        try { parsed = JSON.parse(script[1]); } catch { continue; }
        const version = parsed.version;
        if (version?.id === row.version) {
          schema = version.openapi_schema ?? version._extras?.dereferenced_openapi_schema;
          observedVersion = version.id;
          if (schema) break;
        }
      }
    }
    if (!schema) throw new Error(`Exact pinned schema not present in official source: ${row.key}`);
  } else {
    schema = JSON.parse(body);
    if (!schema.info?.title?.includes(row.endpoint)) throw new Error(`Unexpected fal schema identity: ${row.key}`);
  }
  const serialized = `${JSON.stringify(schema, null, 2)}\n`;
  const schemaSha256 = createHash('sha256').update(serialized).digest('hex');
  await writeFile(new URL(`${row.key}.schema.json`, destination), serialized, 'utf8');
  const entry = {...row, inspectedAt: new Date().toISOString(), sourceUrl: url, httpStatus: response.status, schemaFile: `${row.key}.schema.json`, schemaSha256, observedVersion, immutableBuild: row.provider === 'replicate', inspection: replicateToken ? 'authenticated-read-only-model-version' : 'public-schema-only', liveAccountValidated: false};
  manifest.push(entry);
  console.log(JSON.stringify({key: row.key, observedVersion, schemaSha256, schemas: Object.keys(schema.components?.schemas ?? {})}));
}
await writeFile(new URL('manifest.json', destination), `${JSON.stringify({formatVersion: 1, rows: manifest}, null, 2)}\n`, 'utf8');
