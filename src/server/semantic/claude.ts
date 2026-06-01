import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';

import type { Finding, JobRecord, ReviewFile, Severity } from '../types';
import { filterPacksForKinds, loadGuardrailPacks } from '../guardrails/loader';
import { getDisabledRuleIds } from '../guardrails/config';
import {
  REPORT_FINDINGS_TOOL,
  SYSTEM_PROMPT,
  buildGuardrailsBlock,
  buildUserMessage,
} from './prompt';

export interface SemanticResult {
  findings: Finding[];
  tokenUsage: NonNullable<JobRecord['tokenUsage']>;
}

export async function runSemanticPass(
  files: ReviewFile[],
  staticFindings: Finding[],
  model: string,
): Promise<SemanticResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN;
  const baseURL = process.env.ANTHROPIC_BASE_URL;
  if (!apiKey && !authToken) {
    throw new Error(
      'Set ANTHROPIC_API_KEY in .env.local.',
    );
  }
  const client = new Anthropic({
    ...(apiKey ? { apiKey } : { apiKey: 'unused' }),
    ...(authToken ? { authToken } : {}),
    ...(baseURL ? { baseURL } : {}),
  });

  const [packs, disabledIds] = await Promise.all([loadGuardrailPacks(), getDisabledRuleIds()]);
  const kinds = new Set(files.map((f) => f.kind));
  const relevantPacks = filterPacksForKinds(packs, kinds);
  const guardrailsBlock = buildGuardrailsBlock(relevantPacks, disabledIds);
  const userMessage = buildUserMessage(files, staticFindings);

  console.log(
    `[claude] model=${model} relevantPacks=${relevantPacks.length} ` +
      `guardrailsChars=${guardrailsBlock.length} userMessageChars=${userMessage.length} ` +
      `files=${files.length} staticFindings=${staticFindings.length}`,
  );

  const t0 = Date.now();
  const response = await client.messages.create({
    model,
    max_tokens: 16384,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: guardrailsBlock, cache_control: { type: 'ephemeral' } },
    ],
    tools: [REPORT_FINDINGS_TOOL],
    tool_choice: { type: 'tool', name: 'report_findings' },
    messages: [{ role: 'user', content: userMessage }],
  });

  console.log(
    `[claude] response in ${Date.now() - t0}ms stop_reason=${response.stop_reason} ` +
      `contentBlocks=[${response.content.map((b) => b.type).join(',')}]`,
  );

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    const textBlock = response.content.find((b) => b.type === 'text');
    const textPreview = textBlock && textBlock.type === 'text' ? textBlock.text.slice(0, 500) : '(no text block)';
    console.error('[claude] no tool_use block returned. text preview:\n', textPreview);
    throw new Error(`Claude returned no tool_use block (stop_reason=${response.stop_reason}). See server logs.`);
  }
  const input = toolUse.input as { findings?: ClaudeFindingInput[] };
  const rawCount = Array.isArray(input.findings) ? input.findings.length : -1;
  console.log(`[claude] tool_use input findings count=${rawCount} keys=[${Object.keys(input).join(',')}]`);
  if (response.stop_reason === 'max_tokens' && rawCount <= 0) {
    throw new Error(
      'Claude hit the output token limit before producing valid findings JSON. ' +
        'Raise max_tokens or shrink the guardrails prompt.',
    );
  }
  if (rawCount === 0) {
    console.warn('[claude] WARNING: model reported zero findings. tool_use input:', JSON.stringify(input).slice(0, 500));
  }

  const findings: Finding[] = (input.findings ?? [])
    .filter((f) => !disabledIds.has(f.ruleId))
    .map((f) => ({
      id: randomUUID(),
      source: 'claude',
      ruleId: f.ruleId,
      severity: normalizeSeverity(f.severity),
      category: f.category,
      file: f.file,
      line: f.line,
      endLine: f.endLine,
      message: f.message,
      rationale: f.rationale,
      suggestion: f.suggestion,
    }));

  const usage = response.usage as Anthropic.Messages.Usage & {
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };

  return {
    findings,
    tokenUsage: {
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
    },
  };
}

interface ClaudeFindingInput {
  ruleId: string;
  severity: string;
  category: string;
  file: string;
  line?: number;
  endLine?: number;
  message: string;
  rationale?: string;
  suggestion?: string;
}

function normalizeSeverity(s: string): Severity {
  const norm = s?.toLowerCase();
  if (norm === 'critical' || norm === 'high' || norm === 'medium' || norm === 'low' || norm === 'info') {
    return norm;
  }
  return 'info';
}