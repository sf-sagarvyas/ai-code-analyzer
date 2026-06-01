import { NextResponse } from 'next/server';
import { getJob } from '@/server/jobStore';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: 'job not found' }, { status: 404 });
  return NextResponse.json({
    id: job.id, status: job.status, model: job.model, findings: job.findings,
    files: job.files.map((f) => ({ path: f.path, kind: f.kind, content: f.content })),
    error: job.error, tokenUsage: job.tokenUsage,
  });
}
