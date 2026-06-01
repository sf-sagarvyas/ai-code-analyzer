import 'server-only';

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const CONFIG_PATH = join(process.cwd(), 'guardrails', '.enabled.json');

interface ConfigShape {
  disabledRuleIds: string[];
  updatedAt: string;
}

let cache: ConfigShape | null = null;

export async function loadEnabledConfig(): Promise<ConfigShape> {
  if (cache) return cache;
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<ConfigShape>;
    cache = {
      disabledRuleIds: Array.isArray(parsed.disabledRuleIds) ? parsed.disabledRuleIds : [],
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    // File missing or unreadable — treat all rules as enabled.
    cache = { disabledRuleIds: [], updatedAt: new Date().toISOString() };
  }
  return cache;
}

export async function setRuleEnabled(ruleId: string, enabled: boolean): Promise<ConfigShape> {
  return setRulesEnabledBulk([{ ruleId, enabled }]);
}

export async function setRulesEnabledBulk(
  updates: Array<{ ruleId: string; enabled: boolean }>,
): Promise<ConfigShape> {
  const current = await loadEnabledConfig();
  const set = new Set(current.disabledRuleIds);
  for (const u of updates) {
    if (u.enabled) set.delete(u.ruleId);
    else set.add(u.ruleId);
  }
  const next: ConfigShape = {
    disabledRuleIds: Array.from(set).sort(),
    updatedAt: new Date().toISOString(),
  };
  await writeFile(CONFIG_PATH, JSON.stringify(next, null, 2) + '\n', 'utf-8');
  cache = next;
  return next;
}

export function clearConfigCache() {
  cache = null;
}

export async function isRuleEnabled(ruleId: string): Promise<boolean> {
  const cfg = await loadEnabledConfig();
  return !cfg.disabledRuleIds.includes(ruleId);
}

export async function getDisabledRuleIds(): Promise<Set<string>> {
  const cfg = await loadEnabledConfig();
  return new Set(cfg.disabledRuleIds);
}