import { NextResponse } from 'next/server';
import { clearGuardrailCache } from '@/server/guardrails/loader';
import { appendCustomRule, type NewRuleInput } from '@/server/guardrails/writer';
import type { RuleScope } from '@/server/guardrails/parser';

export const runtime = 'nodejs';

const ALLOWED_APPLIES_TO = new Set(['apex-class', 'apex-trigger', 'lwc-js', 'lwc-html', 'lwc-meta']);

export async function POST(request: Request) {
  let body: Partial<NewRuleInput>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'expected JSON body' }, { status: 400 });
  }

  const { id, title, severity, category, scope, appliesTo, rationale, badExample, goodExample, references } = body;

  if (typeof id !== 'string' || typeof title !== 'string' || typeof severity !== 'string' ||
      typeof category !== 'string' || typeof scope !== 'string' ||
      !Array.isArray(appliesTo) || typeof rationale !== 'string') {
    return NextResponse.json({ error: 'Missing required fields: id, title, severity, category, scope, appliesTo[], rationale' }, { status: 400 });
  }

  if (!['apex', 'lwc', 'shared'].includes(scope)) {
    return NextResponse.json({ error: 'scope must be apex, lwc, or shared' }, { status: 400 });
  }

  const cleanApplies = appliesTo.filter((k): k is string => typeof k === 'string' && ALLOWED_APPLIES_TO.has(k));
  if (cleanApplies.length === 0) {
    return NextResponse.json({ error: 'appliesTo must contain at least one of: apex-class, apex-trigger, lwc-js, lwc-html, lwc-meta' }, { status: 400 });
  }

  try {
    const result = await appendCustomRule({ id: id.toUpperCase(), title, severity: severity.toLowerCase(), category: category.toLowerCase(), scope: scope as RuleScope, appliesTo: cleanApplies, rationale, badExample, goodExample, references });
    clearGuardrailCache();
    return NextResponse.json({ id: result.id, path: result.path });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
