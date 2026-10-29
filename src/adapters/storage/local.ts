import {lstat, mkdir, readFile, rm, writeFile, readdir} from 'node:fs/promises';
import {dirname, isAbsolute, relative, resolve, sep} from 'node:path';

import {DomainError} from '../../db/contracts.ts';
import type {PrivateObjectStore} from './port.ts';
import {assertObjectKey} from './key.ts';



export function resolveLocalObjectPath(root: string, objectKey: string): string {
  assertObjectKey(objectKey);
  const rootPath = resolve(root);
  const target = resolve(rootPath, objectKey);
  const rel = relative(rootPath, target);
  if (isAbsolute(rel) || rel.startsWith(`..${sep}`) || rel === '..') {
    throw new DomainError('FORBIDDEN', 'Asset path escapes the private object root.');
  }
  return target;
}

async function assertNoSymlink(path: string): Promise<void> {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new DomainError('FORBIDDEN', 'Symbolic links are not allowed for private assets.');
  } catch (error) {
    if (error instanceof DomainError) throw error;
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

async function assertNoSymlinkChain(root: string, target: string): Promise<void> {
  const rootPath = resolve(root);
  let current = target;
  const chain: string[] = [];
  while (current !== rootPath && current.startsWith(`${rootPath}${sep}`)) {
    chain.push(current);
    current = dirname(current);
  }
  chain.push(rootPath);
  for (const path of chain.reverse()) await assertNoSymlink(path);
}

export async function writePrivateObject(root: string, objectKey: string, bytes: Uint8Array): Promise<string> {
  const target = resolveLocalObjectPath(root, objectKey);
  await assertNoSymlinkChain(root, target);
  await mkdir(dirname(target), {recursive: true});
  await assertNoSymlinkChain(root, target);
  await writeFile(target, bytes, {flag: 'wx'});
  return target;
}

export async function readPrivateObject(root: string, objectKey: string): Promise<Buffer> {
  const target = resolveLocalObjectPath(root, objectKey);
  await assertNoSymlinkChain(root, target);
  return readFile(target);
}

export async function deletePrivateObject(root: string, objectKey: string): Promise<void> {
  const target = resolveLocalObjectPath(root, objectKey);
  await assertNoSymlinkChain(root, target);
  await rm(target, {force: true});
}

export function createLocalObjectStore(root: string): PrivateObjectStore {
  return {
    driver: 'local',
    async put(objectKey, bytes) {
      const target = resolveLocalObjectPath(root, objectKey);
      await assertNoSymlinkChain(root, target);
      await mkdir(dirname(target), {recursive: true});
      await assertNoSymlinkChain(root, target);
      await writeFile(target, bytes);
    },
    async get(objectKey) { return readPrivateObject(root, objectKey); },
    async delete(objectKey) { await deletePrivateObject(root, objectKey); },
    async head(objectKey) {
      try { const target = resolveLocalObjectPath(root, objectKey); await assertNoSymlinkChain(root, target); const info = await lstat(target); if (info.isSymbolicLink() || !info.isFile()) return null; return {bytes: info.size, modifiedAt: info.mtime}; }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    },
    async list(prefix, limit, after = null) {
      const base = resolveLocalObjectPath(root, prefix); await assertNoSymlinkChain(root, base); const output: string[] = [];
      const visit = async (path: string): Promise<void> => {
        if (output.length >= limit) return;
        let info; try { info = await lstat(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
        if (info.isSymbolicLink()) return;
        if (info.isFile()) { const key = relative(resolve(root), path).split(sep).join('/'); if (!after || key > after) output.push(key); return; }
        if (!info.isDirectory()) return;
        const children = (await readdir(path, {withFileTypes: true}))
          .map((child) => ({name: child.name, sortKey: child.name + (child.isDirectory() ? '/' : '')}))
          .sort((a, b) => a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0);
        for (const child of children) { await visit(resolve(path, child.name)); if (output.length >= limit) return; }
      };
      await visit(base); return output;
    },
  };
}
