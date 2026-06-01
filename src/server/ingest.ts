import 'server-only';

import AdmZip from 'adm-zip';
import { ingestRepoFiles } from './repo';
import { fileKindFromPath, type ReviewFile } from './types';

const ALLOWED_EXT = new Set(['.cls', '.trigger', '.js', '.html', '.xml']);
const MAX_FILES = 50;
const MAX_FILE_BYTES = 250_000;

export async function ingestFormData(formData: FormData): Promise<ReviewFile[]> {
  const files: ReviewFile[] = [];

  const pasted = formData.get('paste');
  const pasteFilename = (formData.get('pasteFilename') as string | null) ?? 'snippet.cls';
  if (typeof pasted === 'string' && pasted.trim().length > 0) {
    files.push({
      path: pasteFilename,
      kind: fileKindFromPath(pasteFilename),
      content: pasted,
    });
  }

  for (const entry of formData.getAll('files')) {
    if (!(entry instanceof File)) continue;
    if (entry.name.toLowerCase().endsWith('.zip')) {
      const buf = Buffer.from(await entry.arrayBuffer());
      const zip = new AdmZip(buf);
      for (const zipEntry of zip.getEntries()) {
        if (zipEntry.isDirectory) continue;
        const path = zipEntry.entryName.replace(/\\/g, '/');
        if (!hasAllowedExt(path)) continue;
        const content = zipEntry.getData().toString('utf-8');
        if (Buffer.byteLength(content, 'utf-8') > MAX_FILE_BYTES) continue;
        files.push({ path, kind: fileKindFromPath(path), content });
        if (files.length >= MAX_FILES) break;
      }
    } else {
      if (!hasAllowedExt(entry.name)) continue;
      if (entry.size > MAX_FILE_BYTES) continue;
      const content = await entry.text();
      files.push({
        path: entry.name,
        kind: fileKindFromPath(entry.name),
        content,
      });
    }
    if (files.length >= MAX_FILES) break;
  }

  const repoPath = formData.get('repoPath');
  const repoFilesRaw = formData.get('repoFiles');
  if (typeof repoPath === 'string' && repoPath.trim() && typeof repoFilesRaw === 'string') {
    try {
      const list = JSON.parse(repoFilesRaw) as unknown;
      if (Array.isArray(list)) {
        const selected = list.filter((s): s is string => typeof s === 'string').slice(0, MAX_FILES - files.length);
        const repoFiles = await ingestRepoFiles(repoPath, selected);
        files.push(...repoFiles);
      }
    } catch {
      // ignore malformed repoFiles JSON; other inputs still proceed
    }
  }

  return files;
}

function hasAllowedExt(path: string): boolean {
  const lower = path.toLowerCase();
  for (const ext of ALLOWED_EXT) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}