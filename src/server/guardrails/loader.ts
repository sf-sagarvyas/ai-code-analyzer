import 'server-only';

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FileKind } from '../types';
import { buildPmdIndex, parseGuardrailRules, type ParsedGuardrailRule } from './parser';

const GUARDRAILS_ROOT = join(process.cwd(), 'guardrails');

const APEX_KINDS: FileKind[] = ['apex-class', 'apex-trigger'];
const LWC_KINDS: FileKind[] = ['lwc-js', 'lwc-html', 'lwc-meta'];

export interface GuardrailPack {
  path: string;
  title: string;
  appliesTo: Set<FileKind>;
  content: string;
}

let cache: GuardrailPack[] | null = null;
let pmdIndexCache: Map<string, ParsedGuardrailRule> | null = null;
let allRulesCache: ParsedGuardrailRule[] | null = null;

export async function loadGuardrailPacks(): Promise<GuardrailPack[]> {
  if (cache) return cache;

  const packs: GuardrailPack[] = [];
  const subdirs = ['apex', 'lwc', 'shared'];
  for (const dir of subdirs) {
    const full = join(GUARDRAILS_ROOT, dir);
    let files: string[] = [];
    try {
      files = await readdir(full);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const path = join(full, file);
      const content = await readFile(path, 'utf-8');
      packs.push({
        path,
        title: file.replace(/\.md$/, ''),
        appliesTo: inferAppliesTo(dir, content),
        content,
      });
    }
  }

  cache = packs;
  return packs;
}

export function clearGuardrailCache() {
  cache = null;
  pmdIndexCache = null;
  allRulesCache = null;
}

/** All parsed rules across apex/lwc/shared. Cached. */
export async function loadAllRules(): Promise<ParsedGuardrailRule[]> {
  if (allRulesCache) return allRulesCache;
  const packs = await loadGuardrailPacks();
  allRulesCache = parseGuardrailRules(packs);
  return allRulesCache;
}

/** Map of PMD rule ID (lowercase) → the guardrail rule that cites it. */
export async function loadPmdIndex(): Promise<Map<string, ParsedGuardrailRule>> {
  if (pmdIndexCache) return pmdIndexCache;
  const packs = await loadGuardrailPacks();
  const rules = parseGuardrailRules(packs);
  pmdIndexCache = buildPmdIndex(rules);
  console.log(
    `[guardrails] parsed ${rules.length} rules, indexed ${pmdIndexCache.size} PMD rule IDs`,
  );
  return pmdIndexCache;
}

function inferAppliesTo(subdir: string, content: string): Set<FileKind> {
  const kinds = new Set<FileKind>();
  if (subdir === 'apex') APEX_KINDS.forEach((k) => kinds.add(k));
  else if (subdir === 'lwc') LWC_KINDS.forEach((k) => kinds.add(k));
  else if (subdir === 'shared') {
    [...APEX_KINDS, ...LWC_KINDS].forEach((k) => kinds.add(k));
  }

  const matches = content.matchAll(/\*\*Applies to:\*\*\s*([^\n]+)/g);
  for (const m of matches) {
    const list = m[1].split(',').map((s) => s.trim());
    for (const item of list) {
      if (
        item === 'apex-class' ||
        item === 'apex-trigger' ||
        item === 'lwc-js' ||
        item === 'lwc-html' ||
        item === 'lwc-meta'
      ) {
        kinds.add(item);
      }
    }
  }
  return kinds;
}

export function filterPacksForKinds(packs: GuardrailPack[], kinds: Set<FileKind>): GuardrailPack[] {
  return packs.filter((pack) => {
    for (const k of kinds) if (pack.appliesTo.has(k)) return true;
    return false;
  });
}