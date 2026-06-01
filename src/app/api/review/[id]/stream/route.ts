import { getEmitter, getJob, type JobEvent } from '@/server/jobStore';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = getJob(id);
  const emitter = getEmitter(id);
  if (!job || !emitter) return new Response('job not found', { status: 404 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); };
      send({ type: 'status', status: job.status });
      for (const f of job.findings) send({ type: 'finding', finding: f });
      if (job.status === 'completed') send({ type: 'done', tokenUsage: job.tokenUsage });
      if (job.status === 'failed') send({ type: 'error', message: job.error ?? 'unknown error' });
      if (job.status === 'completed' || job.status === 'failed') { controller.close(); return; }

      const onEvent = (evt: JobEvent) => {
        send(evt);
        if (evt.type === 'done' || evt.type === 'error') { emitter.off('event', onEvent); controller.close(); }
      };
      emitter.on('event', onEvent);
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
  });
}
