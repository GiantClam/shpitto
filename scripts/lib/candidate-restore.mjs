import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const quote = (identifier) => `"${identifier.replaceAll('"', '""')}"`;

async function snapshot(client) {
  const tables = await client.query("select schemaname, tablename from pg_tables where schemaname not in ('pg_catalog', 'information_schema') order by schemaname, tablename");
  const result = {};
  for (const {schemaname, tablename} of tables.rows) {
    const rows = await client.query(`select row_to_json(t)::text as row from ${quote(schemaname)}.${quote(tablename)} t order by row_to_json(t)::text`);
    result[`${schemaname}.${tablename}`] = {rows: rows.rowCount, sha256: digest(JSON.stringify(rows.rows))};
  }
  return result;
}

function assets(directory, prefix = '') {
  if (!existsSync(directory)) return {};
  return Object.fromEntries(readdirSync(directory, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const relative = `${prefix}${entry.name}`;
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Restore fixture assets must not contain symlinks.');
    return entry.isDirectory() ? Object.entries(assets(absolute, `${relative}/`)) : [[relative, digest(readFileSync(absolute))]];
  }));
}

/** A real restore into a newly-created local database, never a production target. */
export async function rehearseRestore({connectionString, container, evidenceDir, archiveSha256, assetRoot}) {
  const source = new URL(connectionString);
  const database = decodeURIComponent(source.pathname.slice(1));
  if (!['localhost', '127.0.0.1'].includes(source.hostname) || !/^shpitto_candidate_[a-z0-9_]+$/.test(database)) {
    throw new Error('Restore rehearsal requires an isolated localhost shpitto_candidate_* database.');
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(container) || !/^[a-f0-9]{64}$/.test(archiveSha256)) throw new Error('Container and candidate archive binding are required.');
  const docker = process.platform === 'win32' && existsSync('C:/Program Files/Docker/Docker/resources/bin/docker.exe') ? 'C:/Program Files/Docker/Docker/resources/bin/docker.exe' : 'docker';
  const run = (args) => {
    const result = spawnSync(docker, args, {encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 4 * 1024 * 1024});
    if (result.status !== 0) throw new Error(`Local Docker restore operation ${args[0]} failed (${result.status ?? 'launch'}).`);
    return result.stdout;
  };
  const client = new pg.Client({connectionString});
  const restoreUrl = new URL(connectionString);
  restoreUrl.pathname = `${database.slice(0, 52)}_restored`;
  const restoreDatabase = restoreUrl.pathname.slice(1);
  const localDirectory = mkdtempSync(path.join(path.dirname(path.resolve(assetRoot)), 'restore-'));
  const backupFile = path.join(localDirectory, 'database.dump');
  const containerFile = `/tmp/${database}.dump`;
  const restoredAssets = path.join(localDirectory, 'assets');
  let restoreClient;
  await client.connect();
  try {
    const before = await snapshot(client);
    assert.ok(Object.keys(before).length > 10, 'restore must exercise the application schema');
    const beforeAssets = assets(assetRoot);
    assert.ok(Object.keys(beforeAssets).length > 0, 'restore must contain a materialized media asset');
    const backupStarted = performance.now();
    run(['exec', container, 'pg_dump', '-U', decodeURIComponent(source.username), '--format=custom', '--no-owner', '--file', containerFile, database]);
    const listing = run(['exec', container, 'pg_restore', '--list', containerFile]);
    assert.match(listing, /TABLE DATA/);
    run(['cp', `${container}:${containerFile}`, backupFile]);
    cpSync(assetRoot, path.join(localDirectory, 'asset-backup'), {recursive: true});
    const backupMs = performance.now() - backupStarted;
    // Prove the restore recovers the captured version, not the changed live rows.
    await client.query("update app.workspaces set name = name || ' after-backup' where id = (select id from app.workspaces limit 1)");
    assert.notDeepEqual(await snapshot(client), before);
    const started = performance.now();
    await client.query(`create database ${quote(restoreDatabase)}`);
    run(['exec', container, 'pg_restore', '-U', decodeURIComponent(source.username), '--no-owner', '--exit-on-error', '--dbname', restoreDatabase, containerFile]);
    cpSync(path.join(localDirectory, 'asset-backup'), restoredAssets, {recursive: true});
    const restoreMs = performance.now() - started;
    restoreClient = new pg.Client({connectionString: restoreUrl.toString()});
    await restoreClient.connect();
    assert.deepEqual(await snapshot(restoreClient), before, 'all persisted domain rows survive restore');
    assert.deepEqual(assets(restoredAssets), beforeAssets, 'all private media bytes survive restore');
    const evidence = {
      status: 'PASS', profile: 'local-docker-candidate-restore', archiveSha256,
      database, restoredDatabase: restoreDatabase, backupMs: Math.round(backupMs), restoreMs: Math.round(restoreMs),
      backupSha256: digest(readFileSync(backupFile)), tables: before, assetFiles: beforeAssets,
      checks: {backupCatalog: 'PASS', liveMutationDetected: 'PASS', restoredDomainRows: 'PASS', restoredPrivateMediaBytes: 'PASS'},
      production: false, secretsRetained: false,
    };
    mkdirSync(evidenceDir, {recursive: true});
    writeFileSync(path.join(evidenceDir, 'restore.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    return {databaseUrl: restoreUrl.toString(), assetRoot: restoredAssets, evidence};
  } finally {
    await restoreClient?.end();
    await client.end();
    run(['exec', container, 'rm', '-f', containerFile]);
    rmSync(backupFile, {force: true});
    rmSync(path.join(localDirectory, 'asset-backup'), {recursive: true, force: true});
  }
}
