import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {createCustomerPackage, validateCustomerCommands} from './customer-package.ts';

type ExportClass = {include: string[]; exclude: string[]};
type ExportManifest = {schemaVersion: string; release: string; customerRuntime: ExportClass; buyerGuidance: ExportClass; forbiddenContent: string[]};
type CandidateFile = {class: 'customerRuntime' | 'buyerGuidance'; source: string; archivePath: string; bytes: number; sha256: string};

const root = process.cwd();
const candidateId = process.env.SHPITTO_CANDIDATE_ID?.trim() || `local-candidate-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`;
const outputDir = path.join(root, 'internal', 'evidence', 'm8', 'artifact-manifest', candidateId);
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function normalize(relative: string): string {
  return relative.replaceAll('\\', '/');
}

function releaseBytes(source: string): Buffer {
  const bytes = readFileSync(path.join(root, source));
  return source === 'package.json'
    ? Buffer.from(`${JSON.stringify(createCustomerPackage(JSON.parse(bytes.toString('utf8'))), null, 2)}\n`, 'utf8')
    : bytes;
}

function walk(relative: string): string[] {
  const absolute = path.join(root, relative);
  if (!existsSync(absolute)) throw new Error(`Allowlisted release path is missing: ${relative}`);
  if (!statSync(absolute).isDirectory()) return [normalize(relative)];
  return readdirSync(absolute).flatMap((entry) => walk(path.join(relative, entry)));
}

function isExcluded(file: string, excluded: string[]): boolean {
  const normalized = normalize(file);
  return excluded.some((entry) => normalized === entry || normalized.startsWith(`${entry}/`) || (entry.startsWith('*') && normalized.endsWith(entry.slice(1))));
}

function collect(exportClass: ExportClass, className: CandidateFile['class']): CandidateFile[] {
  return [...new Set(exportClass.include.flatMap(walk))].sort().filter((file) => !isExcluded(file, exportClass.exclude)).map((source) => {
    const bytes = releaseBytes(source);
    return {class: className, source, archivePath: `${className}/${source}`, bytes: bytes.length, sha256: hash(bytes)};
  });
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Buffer { const buffer = Buffer.alloc(2); buffer.writeUInt16LE(value, 0); return buffer; }
function u32(value: number): Buffer { const buffer = Buffer.alloc(4); buffer.writeUInt32LE(value >>> 0, 0); return buffer; }

function createZip(files: CandidateFile[]): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.archivePath, 'utf8');
    const bytes = releaseBytes(file.source);
    if (bytes.length !== file.bytes || hash(bytes) !== file.sha256) throw new Error(`Source changed during candidate packaging: ${file.source}`);
    const checksum = crc32(bytes);
    const header = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), u16(20), u16(0), u16(0), u16(0), u16(0), u32(checksum), u32(bytes.length), u32(bytes.length), u16(name.length), u16(0), name]);
    local.push(header, bytes);
    const directory = Buffer.concat([Buffer.from([0x50, 0x4b, 0x01, 0x02]), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(checksum), u32(bytes.length), u32(bytes.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]);
    central.push(directory);
    offset += header.length + bytes.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.concat([Buffer.from([0x50, 0x4b, 0x05, 0x06]), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralBytes.length), u32(offset), u16(0)]);
  return Buffer.concat([...local, centralBytes, end]);
}

function run(): void {
  const manifest = JSON.parse(readFileSync(path.join(root, '.shpitto', 'contracts', 'export-manifest.json'), 'utf8')) as ExportManifest;
  if (manifest.release !== 'v1' || manifest.schemaVersion !== '1.0') throw new Error('Only the reviewed v1 export manifest can be packaged.');
  const files = [...collect(manifest.customerRuntime, 'customerRuntime'), ...collect(manifest.buyerGuidance, 'buyerGuidance')];
  const runtimePaths = new Set(files.filter((file) => file.class === 'customerRuntime').map((file) => file.source));
  const commandErrors = validateCustomerCommands(JSON.parse(releaseBytes('package.json').toString('utf8')), (file) => runtimePaths.has(file));
  if (commandErrors.length) throw new Error(commandErrors.join('; '));
  for (const file of files) {
    const content = readFileSync(path.join(root, file.source), 'utf8');
    if (manifest.forbiddenContent.some((needle) => new RegExp(needle).test(content))) throw new Error(`Forbidden content in candidate file: ${file.source}`);
  }
  mkdirSync(outputDir, {recursive: true});
  const zip = createZip(files);
  const zipPath = path.join(outputDir, `${candidateId}.zip`);
  writeFileSync(zipPath, zip);
  const packageManifest = {status: 'IN_PROGRESS', profile: 'local-candidate-only', candidateId, release: manifest.release, generatedAt: new Date().toISOString(), releaseGate: 'NOT_RUN', productionDeployment: 'NOT_RUN', realAccounts: 'NOT_PROVIDED', files, zip: {path: normalize(path.relative(root, zipPath)), bytes: zip.length, sha256: hash(zip)}, note: 'Candidate packaging is reproducible local evidence. M8 RC/BETA/STABLE and commercial/provider gates remain open.'};
  writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify(packageManifest, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(packageManifest, null, 2));
}

run();
