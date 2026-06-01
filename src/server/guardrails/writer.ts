import 'server-only';

import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { RuleScope } from './parser';

const GUARDRAILS_ROOT = join(process.cwd(), 'guardrails');

export interface NewRuleInput {
  id: string;
  title: string;
  severity: string;
  category: string;
  scope: RuleScope;
  appliesTo: string[];
  rationale: string;
  badExample?: string;
  goodExample?: string;
  references?: string;
}

const VALID_SCOPE: RuleScope[] = ['apex', 'lwc', 'shared'];

export async function appendCustomRule(input: NewRuleInput): Promise<{ path: string; id: string }> {
  if (!VALID_SCOPE.includes(input.scope)) {
    throw new Error(`Invalid scope: ${input.scope}`);
  }
  if (!/^[A-Z][A-Z0-9_-]+-\d+$/.test(input.id)) {
    throw new Error(`Invalid rule id "${input.id}". Use e.g. CUSTOM-NAMING-001 (UPPERCASE letters/digits, ending in -###).`);
  }
  if (!input.title.trim() || !input.rationale.trim()) {
    throw new Error('Title and rationale are required.');
  }

  const filePath = join(GUARDRAILS_ROOT, input.scope, 'custom.md');
  await mkdir(dirname(filePath), { recursive: true });

  if (await ruleIdExists(input.id)) {
    throw new Error(`Rule id "${input.id}" already exists in another file.`);
  }

  const isNewFile = !existsSync(filePath);
  if (isNewFile) {
    const header =
      `# Custom ${capitalize(input.scope)} Rules\n\n` +
      `User-authored rules for ${input.scope} code review. Rules added via the Guardrails Configuration UI land here.\n\n` +
      `---\n\n`;
    await writeFile(filePath, header, 'utf-8');
  }

  const block = formatRuleBlock(input);
  await appendFile(filePath, block, 'utf-8');

  return { path: filePath, id: input.id };
}

async function ruleIdExists(id: string): Promise<boolean> {
  // Look across all guardrail markdown files for a heading with this ID.
  const { readdir } = await import('node:fs/promises');
  for (const sub of ['apex', 'lwc', 'shared']) {
    const dir = join(GUARDRAILS_ROOT, sub);
    let files: string[] = [];
    try {
      files = await readdir(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith('.md')) continue;
      const content = await readFile(join(dir, f), 'utf-8');
      if (new RegExp(`^## RULE ${id}:`, 'm').test(content)) return true;
    }
  }
  return false;
}

function formatRuleBlock(input: NewRuleInput): string {
  const lines: string[] = [];
  lines.push(`## RULE ${input.id}: ${input.title.trim()}`);
  lines.push('');
  lines.push(`**Severity:** ${input.severity}`);
  lines.push(`**Category:** ${input.category}`);
  lines.push(`**Applies to:** ${input.appliesTo.join(', ')}`);
  lines.push('');
  lines.push(`**Rationale:** ${input.rationale.trim()}`);
  lines.push('');
  if (input.badExample && input.badExample.trim()) {
    lines.push(`**Bad example:**`);
    lines.push('```' + languageHintFor(input.scope));
    lines.push(input.badExample.trim());
    lines.push('```');
    lines.push('');
  }
  if (input.goodExample && input.goodExample.trim()) {
    lines.push(`**Good example:**`);
    lines.push('```' + languageHintFor(input.scope));
    lines.push(input.goodExample.trim());
    lines.push('```');
    lines.push('');
  }
  if (input.references && input.references.trim()) {
    lines.push(`**References:** ${input.references.trim()}`);
    lines.push('');
  }
  lines.push('---');
  lines.push('');
  return lines.join('\n');
}

function languageHintFor(scope: RuleScope): string {
  if (scope === 'apex') return 'apex';
  if (scope === 'lwc') return 'javascript';
  return '';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}