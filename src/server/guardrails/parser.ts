import 'server-only';

import type { GuardrailPack } from './loader';

export type RuleScope = 'apex' | 'lwc' | 'shared';

export interface ParsedGuardrailRule {
  id: string;
  title: string;
  severity: string;
  category: string;
  appliesTo: string[];
  rationale: string;
  badExample?: string;
  goodExample?: string;
  references?: string;
  pmdRuleIds: string[]; // lowercased
  scope: RuleScope;
  sourcePackTitle: string;
  sourcePath: string; // absolute path of the source markdown file
}

export function parseGuardrailRules(packs: GuardrailPack[]): ParsedGuardrailRule[] {
  const rules: ParsedGuardrailRule[] = [];
  for (const pack of packs) {
    const scope = inferScope(pack.path);
    const blocks = splitIntoRuleBlocks(pack.content);
    for (const block of blocks) {
      const rule = parseRuleBlock(block, pack.title, scope, pack.path);
      if (rule) rules.push(rule);
    }
  }
  return rules;
}

export function buildPmdIndex(rules: ParsedGuardrailRule[]): Map<string, ParsedGuardrailRule> {
  const map = new Map<string, ParsedGuardrailRule>();
  for (const rule of rules) {
    for (const pmdId of rule.pmdRuleIds) {
      if (!map.has(pmdId)) map.set(pmdId, rule);
    }
  }
  return map;
}

function inferScope(filePath: string): RuleScope {
  const norm = filePath.replace(/\\/g, '/');
  if (norm.includes('/apex/')) return 'apex';
  if (norm.includes('/lwc/')) return 'lwc';
  return 'shared';
}

function splitIntoRuleBlocks(content: string): string[] {
  const parts = content.split(/^## RULE /m);
  return parts.slice(1).map((p) => '## RULE ' + p);
}

function parseRuleBlock(
  block: string,
  sourcePackTitle: string,
  scope: RuleScope,
  sourcePath: string,
): ParsedGuardrailRule | null {
  const headingMatch = block.match(/^## RULE\s+([A-Z][A-Z0-9_-]+-\d+):\s*(.+?)\s*$/m);
  if (!headingMatch) return null;
  const id = headingMatch[1].trim();
  const title = headingMatch[2].trim();

  const severity = (extractField(block, 'Severity') ?? 'medium').toLowerCase();
  const category = (extractField(block, 'Category') ?? 'other').toLowerCase();
  const appliesToLine = extractField(block, 'Applies to') ?? '';
  const appliesTo = appliesToLine
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const rationale = extractMultilineField(block, 'Rationale') ?? '';
  const badExample = extractCodeBlock(block, 'Bad example');
  const goodExample = extractCodeBlock(block, 'Good example');
  const references = extractField(block, 'References');

  const pmdRuleIds: string[] = [];
  if (references) {
    const matches = references.matchAll(/pmd\.github\.io\/pmd\/pmd_rules_apex\.html#([a-z0-9_-]+)/gi);
    for (const m of matches) pmdRuleIds.push(m[1].toLowerCase());
  }

  return {
    id,
    title,
    severity,
    category,
    appliesTo,
    rationale,
    badExample,
    goodExample,
    references,
    pmdRuleIds,
    scope,
    sourcePackTitle,
    sourcePath,
  };
}

function extractField(block: string, fieldName: string): string | undefined {
  const re = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+?)\\s*$`, 'm');
  const m = block.match(re);
  return m ? m[1].trim() : undefined;
}

function extractMultilineField(block: string, fieldName: string): string | undefined {
  const startRe = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*`, 'm');
  const start = block.search(startRe);
  if (start < 0) return undefined;
  const after = block.slice(start).replace(startRe, '');
  const stopRe = /\n(\*\*[A-Z][A-Za-z ]+:\*\*|```|---|## )/;
  const stop = after.search(stopRe);
  const body = (stop >= 0 ? after.slice(0, stop) : after).trim();
  return body || undefined;
}

function extractCodeBlock(block: string, name: string): string | undefined {
  const startRe = new RegExp(`\\*\\*${name}:\\*\\*\\s*\\n+\`\`\`[a-zA-Z]*\\n`);
  const startMatch = block.match(startRe);
  if (!startMatch || startMatch.index === undefined) return undefined;
  const afterFence = block.slice(startMatch.index + startMatch[0].length);
  const end = afterFence.indexOf('\n```');
  if (end < 0) return undefined;
  return afterFence.slice(0, end).trim();
}