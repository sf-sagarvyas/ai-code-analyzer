import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { ingestFormData } from '@/server/ingest';
import { createJob } from '@/server/jobStore';
import { runReview } from '@/server/orchestrator';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let formData: FormData;
  try { formData = await request.formData(); } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const files = await ingestFormData(formData);
  if (files.length === 0) {
    return NextResponse.json(
      { error: 'No reviewable files. Paste code or upload .cls/.trigger/.js/.html/.xml/.zip files.' },
      { status: 400 },
    );
  }

  const model = (formData.get('model') as string | null) ?? process.env.ANTHROPIC_MODEL ?? process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-5';
  const jobId = randomUUID();

  createJob({ id: jobId, createdAt: new Date().toISOString(), status: 'queued', model, files, findings: [] });
  void runReview(jobId, files, model);

  return NextResponse.json({ jobId, fileCount: files.length, model });
}
