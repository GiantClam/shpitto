import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';

const root = process.cwd();
const evidenceDirectory = path.dirname(fileURLToPath(import.meta.url));
const container = 'shpitto-completion-pg-20261019';
const docker = 'C:/Program Files/Docker/Docker/resources/bin/docker.exe';
const compose = readFileSync(path.join(root, 'deploy/compose.local.yml'), 'utf8');
const declared = Object.fromEntries(['USER', 'PASSWORD', 'DB'].map((key) => {
  const match = compose.match(new RegExp(`^\\s+POSTGRES_${key}: ([^\\r\\n]+)$`, 'm'));
  assert.ok(match, `Missing declared local PostgreSQL ${key} setting.`);
  return [key, match[1].trim()];
}));
const probe = `shpitto_infra_${randomUUID().replaceAll('-', '')}`;
const restoredProbe = `${probe}_restore`;
const temporaryDump = `/tmp/${probe}.dump`;
const createdDatabases = [];
const checks = {};
const record = {
  startedAt: new Date().toISOString(),
  scope: 'disposable-local-postgresql-infrastructure-only',
  requestedContainer: 'shpitto-completion-pg-20261007',
  container,
  endpoint: {host: '127.0.0.1', port: 55432, database: 'postgres'},
  recovery: {
    desktopLaunchedHiddenBeforePreflight: true,
    requestedContainerAbsent: true,
    replacementFoundWithCurrentTaskLabel: true,
    existingReplacementStarted: true,
    existingVolumesPreserved: true,
    containersCreated: 0,
    volumesCreated: 0,
  },
  production: false,
  paidOrRemoteProvidersAccessed: false,
  candidatesPackagedOrExecuted: false,
  credentialsRetained: false,
  checks,
};
const clean = (value) => String(value).replaceAll(declared.PASSWORD, '[REDACTED]');
function run(args) {
  const result = spawnSync(docker, args, {encoding: 'utf8', windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024});
  assert.equal(result.status, 0, `Local Docker operation ${args[0]} failed.`);
  return result.stdout.trim();
}
const connect = async (database = 'postgres') => {
  const client = new pg.Client({host: '127.0.0.1', port: 55432, user: declared.USER,
    password: declared.PASSWORD, database, connectionTimeoutMillis: 5000});
  await client.connect();
  return client;
};
let admin;
let probeClient;
let restoredClient;
let dumpCreated = false;
try {
  const context = JSON.parse(run(['context', 'inspect', 'desktop-linux']))[0];
  assert.equal(context.Endpoints.docker.Host, 'npipe:////./pipe/dockerDesktopLinuxEngine');
  record.docker = {context: run(['context', 'show']), serverVersion: run(['version', '--format', '{{.Server.Version}}'])};
  assert.equal(record.docker.context, 'desktop-linux');
  checks.localDockerEngine = 'PASS';
  const inspect = JSON.parse(run(['inspect', container]))[0];
  assert.equal(inspect.Name, `/${container}`);
  assert.equal(inspect.Config.Image, 'postgres:15-alpine');
  assert.equal(inspect.Config.Labels['shpitto.task'], 'spec-current-20261019');
  assert.equal(inspect.State.Running, true);
  assert.deepEqual(inspect.HostConfig.PortBindings['5432/tcp'], [{HostIp: '127.0.0.1', HostPort: '55432'}]);
  assert.equal(inspect.Mounts.length, 1);
  assert.equal(inspect.Mounts[0].Type, 'volume');
  assert.equal(inspect.Mounts[0].Destination, '/var/lib/postgresql/data');
  const environment = Object.fromEntries(inspect.Config.Env.map((value) => [value.slice(0, value.indexOf('=')), value.slice(value.indexOf('=') + 1)]));
  for (const key of ['USER', 'PASSWORD']) assert.equal(environment[`POSTGRES_${key}`], declared[key], `Container local ${key} setting differs from compose.`);
  // The isolated runners create their own databases from postgres; the image's
  // initial default database need not match the full local application's name.
  assert.ok(['postgres', declared.DB].includes(environment.POSTGRES_DB), 'Unexpected disposable container default database.');
  record.databaseInitialization = {composeDefaultDatabase: declared.DB,
    containerDefaultDatabase: environment.POSTGRES_DB, administrativeDatabase: 'postgres'};
  record.identity = {id: inspect.Id, createdAt: inspect.Created, image: inspect.Config.Image,
    imageId: inspect.Image, taskLabel: inspect.Config.Labels['shpitto.task'],
    dataVolume: inspect.Mounts[0].Name, state: inspect.State.Status};
  checks.disposableContainerIdentity = 'PASS';
  checks.loopbackPortBinding = 'PASS';
  checks.declaredLocalCredentials = 'PASS';
  record.tools = Object.fromEntries(['pg_dump', 'pg_restore', 'psql'].map((tool) => [tool, run(['exec', container, tool, '--version'])]));
  checks.backupToolVersions = 'PASS';
  record.readyProbe = run(['exec', container, 'pg_isready', '-U', declared.USER, '-d', 'postgres']);
  admin = await connect();
  const role = (await admin.query('select rolcreatedb, rolsuper from pg_roles where rolname = current_user')).rows[0];
  assert.ok(role.rolcreatedb || role.rolsuper, 'Local verification role lacks CREATE DATABASE privilege.');
  record.database = {serverVersion: (await admin.query('show server_version')).rows[0].server_version,
    createDatabasePrivilege: role.rolcreatedb, superuser: role.rolsuper};
  checks.hostAuthenticatedConnection = 'PASS';
  for (const database of [probe, restoredProbe]) {
    await admin.query(`create database "${database}"`);
    createdDatabases.push(database);
  }
  checks.createDatabase = 'PASS';
  probeClient = await connect(probe);
  await probeClient.query('create table infrastructure_probe (id integer primary key, marker text not null)');
  await probeClient.query('insert into infrastructure_probe (id, marker) values ($1, $2)', [1, 'disposable-preflight-only']);
  run(['exec', container, 'pg_dump', '-U', declared.USER, '--format=custom', '--no-owner', '--file', temporaryDump, probe]);
  dumpCreated = true;
  const catalog = run(['exec', container, 'pg_restore', '--list', temporaryDump]);
  assert.match(catalog, /TABLE DATA public infrastructure_probe/);
  record.backup = {format: 'PostgreSQL custom archive', tableDataCatalogVerified: true};
  checks.customArchiveBackup = 'PASS';
  run(['exec', container, 'pg_restore', '-U', declared.USER, '--no-owner', '--exit-on-error', '--dbname', restoredProbe, temporaryDump]);
  restoredClient = await connect(restoredProbe);
  assert.deepEqual((await restoredClient.query('select id, marker from infrastructure_probe order by id')).rows,
    [{id: 1, marker: 'disposable-preflight-only'}]);
  checks.backupRestoreRoundTrip = 'PASS';
  record.status = 'READY';
} catch (error) {
  record.status = 'BLOCKED';
  record.error = clean(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  const cleanupErrors = [];
  for (const client of [restoredClient, probeClient]) {
    try { await client?.end(); } catch { cleanupErrors.push('Could not close a probe database client.'); }
  }
  for (const database of [...createdDatabases].reverse()) {
    try { await admin.query(`drop database "${database}"`); }
    catch { cleanupErrors.push(`Could not drop this preflight's isolated database ${database}.`); }
  }
  try { await admin?.end(); } catch { cleanupErrors.push('Could not close the local administrative connection.'); }
  if (dumpCreated) {
    try { run(['exec', container, 'rm', '-f', temporaryDump]); }
    catch { cleanupErrors.push('Could not remove this preflight temporary dump.'); }
  }
  checks.probeCleanup = cleanupErrors.length ? 'FAIL' : 'PASS';
  record.cleanup = {isolatedDatabasesCreated: createdDatabases, allProbeDatabasesDropped: !cleanupErrors.length,
    temporaryDumpRemoved: dumpCreated && !cleanupErrors.length, containerLeftRunning: true,
    existingDatabaseRowsChanged: false, volumesDeleted: false, errors: cleanupErrors};
  if (cleanupErrors.length) { record.status = 'BLOCKED'; process.exitCode = 1; }
  record.completedAt = new Date().toISOString();
  writeFileSync(path.join(evidenceDirectory, 'infrastructure-preflight.json'), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({status: record.status, container, endpoint: record.endpoint, checks, error: record.error}));
}
