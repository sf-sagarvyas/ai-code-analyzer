import 'server-only';

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileKindFromPath, type ReviewFile } from './types';

const ALLOWED_EXT = new Set(['.cls', '.trigger', '.js', '.html', '.xml']);
const IGNORE_DIR = new Set([
  'node_modules',
  '.git',
  '.next',
  '.vscode',
  '.idea',
  'dist',
  'build',
  'out',
  'bin',
  'coverage',
  '.cache',
  '.sf',
  '.sfdx',
  '__pycache__',
  '.turbo',
  '.parcel-cache',
]);
const MAX_NODES = 2000;
const MAX_FILE_BYTES = 250_000;

export type TreeNode =
  | { type: 'dir'; name: string; path: string; children: TreeNode[] }
  | { type: 'file'; name: string; path: string };

export async function listRepo(rootPath: string): Promise<{ root: string; tree: TreeNode[]; fileCount: number }> {
  const root = resolve(rootPath);
  const st = await stat(root);
  if (!st.isDirectory()) {
    throw new Error(`Not a directory: ${root}`);
  }

  let nodeCount = 0;
  let fileCount = 0;

  async function walk(dir: string, rel: string): Promise<TreeNode[]> {
    if (nodeCount >= MAX_NODES) return [];
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const out: TreeNode[] = [];
    for (const e of entries) {
      if (nodeCount >= MAX_NODES) break;
      if (e.isDirectory()) {
        if (IGNORE_DIR.has(e.name)) continue;
        nodeCount++;
        const childRel = rel ? `${rel}/${e.name}` : e.name;
        const children = await walk(join(dir, e.name), childRel);
        if (children.length === 0) continue; // hide dirs with no reviewable descendants
        out.push({ type: 'dir', name: e.name, path: childRel, children });
      } else if (e.isFile()) {
        const lower = e.name.toLowerCase();
        const dot = lower.lastIndexOf('.');
        const ext = dot >= 0 ? lower.slice(dot) : '';
        const reviewable = ALLOWED_EXT.has(ext) || lower.endsWith('.js-meta.xml');
        if (!reviewable) continue;
        nodeCount++;
        fileCount++;
        const filePath = rel ? `${rel}/${e.name}` : e.name;
        out.push({ type: 'file', name: e.name, path: filePath });
      }
    }
    return out;
  }

  const tree = await walk(root, '');
  return { root, tree, fileCount };
}

export async function ingestRepoFiles(rootPath: string, selectedFiles: string[]): Promise<ReviewFile[]> {
  const root = resolve(rootPath);
  const out: ReviewFile[] = [];
  for (const rel of selectedFiles) {
    const safe = rel.replace(/\\/g, '/').replace(/^\/+/, '');
    if (safe.includes('..')) continue;
    const full = resolve(root, safe);
    if (!full.startsWith(root)) continue;
    try {
      const buf = await readFile(full);
      if (buf.byteLength > MAX_FILE_BYTES) continue;
      const content = buf.toString('utf-8');
      out.push({ path: safe, kind: fileKindFromPath(safe), content });
    } catch {
      continue;
    }
  }
  return out;
}