import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const pathArg = process.argv[2];
const b64 = process.argv[3];
if (!pathArg || !b64) {
  console.error('Usage: probe-write-b64-file.ts <absolute-path> <base64>');
  process.exit(2);
}
const path = resolve(pathArg);
if (!path.startsWith('/tmp/')) {
  console.error('Refusing to write outside /tmp');
  process.exit(2);
}
writeFileSync(path, Buffer.from(b64, 'base64'), {mode: 0o600});
console.log(JSON.stringify({ok: true, path, bytes: Buffer.from(b64, 'base64').length}));
