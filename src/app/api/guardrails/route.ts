import { NextResponse } from 'next/server';
import { loadAllRules } from '@/server/guardrails/loader';
import { getDisabledRuleIds } from '@/server/guardrails/config';

export const runtime = 'nodejs';

export async function GET() {
  const [rules, disabled] = await Promise.all([loadAllRules(), getDisabledRuleIds()]);
  return NextResponse.json({
    rules: rules.map((r) => ({
      id: r.id, title: r.title, severity: r.severity, category: r.category,
      scope: r.scope, appliesTo: r.appliesTo, rationale: r.rationale,
      badExample: r.badExample, goodExample: r.goodExample, references: r.references,
      pmdRuleIds: r.pmdRuleIds, sourcePackTitle: r.sourcePackTitle,
      enabled: !disabled.has(r.id),
    })),
  });
}
