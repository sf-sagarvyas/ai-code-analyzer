import 'server-only';

import type { GuardrailPack } from '../guardrails/loader';
import type { Finding, ReviewFile } from '../types';

/** Removes rule blocks whose ID is in `disabledIds` from a pack's Markdown content. */
export function stripDisabledRules(packContent: string, disabledIds: Set<string>): string {
  if (disabledIds.size === 0) return packContent;
  // Split into blocks at "## RULE " boundaries, drop any whose heading ID is disabled.
  const parts = packContent.split(/^## RULE /m);
  const head = parts[0];
  const kept = parts.slice(1).filter((block) => {
    const m = block.match(/^([A-Z][A-Z0-9_-]+-\d+):/);
    return !m || !disabledIds.has(m[1]);
  });
  return head + kept.map((b) => '## RULE ' + b).join('');
}

export const SYSTEM_PROMPT = `You are a senior Salesforce code reviewer. You are reviewing APEX classes/triggers and Lightning Web Components against a set of guardrail rule packs that will be provided to you.

Your job:
1. Read every guardrail rule pack carefully. Each rule has an ID (e.g. APEX-SEC-003), a severity, applies-to file kinds, a rationale, detection signals, and good/bad examples.
2. Read the code bundle. Files are delimited with "===== FILE: <path> (<kind>) =====" headers.
3. Identify rule violations and semantic issues. Cite the rule ID in every finding. If a finding is not covered by a specific rule but is a clear best-practice violation, still report it with ruleId="SEMANTIC-OBSERVATION".
4. Static analyzer findings (PMD/ESLint) are listed for context — do NOT duplicate them. You may elaborate on a static finding's rationale only if it materially helps the developer.
5. Prefer fewer high-quality findings over many noisy ones — but treat every explicit guardrail rule as in-scope, regardless of its severity. In particular, ALWAYS evaluate naming conventions for classes, methods, and variables (APEX-NAME-* / shared) and report violations even when more severe findings exist in the same file; cryptic, abbreviated, or non-conventional identifiers are a real defect, not a style nit. The only thing to skip is pure whitespace/brace-style not covered by a rule.

Output: call the report_findings tool exactly once with all findings as an array. Do not include any text outside the tool call.`;

export function buildGuardrailsBlock(packs: GuardrailPack[], disabledIds: Set<string> = new Set()): string {
  const sections = packs.map((p) => {
    const content = stripDisabledRules(p.content, disabledIds);
    return `\n# Guardrails: ${p.title}\n\n${content}`;
  });
  return `The following guardrail rule packs define the standards you must enforce:\n${sections.join('\n\n')}`;
}

export function buildUserMessage(files: ReviewFile[], staticFindings: Finding[]): string {
  const parts: string[] = [];
  parts.push('Review the following bundle. Cite rule IDs in each finding.\n');

  if (staticFindings.length > 0) {
    parts.push('## Static analyzer findings (already reported — do not duplicate)');
    parts.push(
      staticFindings
        .map(
          (f) =>
            `- [${f.source} ${f.ruleId}] ${f.file}${f.line ? `:${f.line}` : ''} (${f.severity}) — ${f.message}`,
        )
        .join('\n'),
    );
    parts.push('');
  }

  parts.push('## Code bundle');
  for (const f of files) {
    parts.push(`\n===== FILE: ${f.path} (${f.kind}) =====`);
    parts.push('```');
    parts.push(f.content);
    parts.push('```');
  }

  return parts.join('\n');
}

export const REPORT_FINDINGS_TOOL = {
  name: 'report_findings',
  description: 'Report all findings discovered during the semantic review.',
  input_schema: {
    type: 'object' as const,
    properties: {
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            ruleId: { type: 'string', description: 'Cited rule ID, e.g. APEX-SEC-003, or SEMANTIC-OBSERVATION.' },
            severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
            category: { type: 'string', description: 'security | performance | architecture | naming | testing | governance | reactivity | accessibility | documentation' },
            file: { type: 'string', description: 'Relative file path matching a file in the bundle.' },
            line: { type: 'integer', description: 'Starting line number of the violation, 1-indexed.' },
            endLine: { type: 'integer', description: 'Ending line number of the violation, 1-indexed.' },
            message: { type: 'string', description: 'One-sentence summary of the violation.' },
            rationale: { type: 'string', description: 'Why this matters — quote the rule rationale or expand on it.' },
            suggestion: { type: 'string', description: 'Concrete fix, ideally a small diff or replacement snippet.' },
          },
          required: ['ruleId', 'severity', 'category', 'file', 'message'],
        },
      },
    },
    required: ['findings'],
  },
};