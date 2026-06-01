import { NextResponse } from 'next/server';
import { setRulesEnabledBulk } from '@/server/guardrails/config';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: { ruleIds?: unknown; enabled?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'expected JSON body' }, { status: 400 });
  }
  const { ruleIds, enabled } = body;
  if (!Array.isArray(ruleIds) || typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'ruleIds (string[]) and enabled (boolean) required' }, { status: 400 });
  }
  const cleanIds = ruleIds.filter((s): s is string => typeof s === 'string');
  if (cleanIds.length === 0) return NextResponse.json({ error: 'ruleIds must not be empty' }, { status: 400 });
  const config = await setRulesEnabledBulk(cleanIds.map((ruleId) => ({ ruleId, enabled })));
  return NextResponse.json({ config, updated: cleanIds.length });
}
