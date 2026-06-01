import { NextResponse } from 'next/server';
import { listRepo } from '@/server/repo';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: { path?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'expected JSON body { path }' }, { status: 400 });
  }
  const path = body?.path;
  if (typeof path !== 'string' || !path.trim()) {
    return NextResponse.json({ error: 'path is required' }, { status: 400 });
  }
  try {
    const result = await listRepo(path);
    if (result.fileCount === 0) {
      return NextResponse.json({ ...result, warning: 'No reviewable files (.cls, .trigger, .js, .html, .xml) found under this path.' });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
