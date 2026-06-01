import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createJob, getJob } from '@/server/jobStore';
import { runReview } from '@/server/orchestrator';

export const runtime = 'nodejs';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const previous = getJob(id);
  if (!previous) return NextResponse.json({ error: 'previous job not found' }, { status: 404 });
  const jobId = randomUUID();
  createJob({ id: jobId, createdAt: new Date().toISOString(), status: 'queued', model: previous.model, files: previous.files, findings: [] });
  void runReview(jobId, previous.files, previous.model);
  return NextResponse.json({ jobId, fileCount: previous.files.length, model: previous.model });
}
