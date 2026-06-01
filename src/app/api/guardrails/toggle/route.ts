import { NextResponse } from 'next/server';
import { setRuleEnabled } from '@/server/guardrails/config';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: { ruleId?: unknown; enabled?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'expected JSON body' }, { status: 400 });
  }
  const { ruleId, enabled } = body;
  if (typeof ruleId !== 'string' || typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'ruleId (string) and enabled (boolean) required' }, { status: 400 });
  }
  const config = await setRuleEnabled(ruleId, enabled);
  return NextResponse.json({ config });
}
