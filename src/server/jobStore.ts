import 'server-only';

import { EventEmitter } from 'node:events';
import type { Finding, JobRecord, JobStatus } from './types';

declare global {
  // eslint-disable-next-line no-var
  var __aica_jobs: Map<string, JobRecord> | undefined;
  // eslint-disable-next-line no-var
  var __aica_emitters: Map<string, EventEmitter> | undefined;
}

const jobs = (globalThis.__aica_jobs ??= new Map<string, JobRecord>());
const emitters = (globalThis.__aica_emitters ??= new Map<string, EventEmitter>());

export type JobEvent =
  | { type: 'status'; status: JobStatus }
  | { type: 'finding'; finding: Finding }
  | { type: 'error'; message: string }
  | { type: 'done'; tokenUsage?: JobRecord['tokenUsage'] };

export function createJob(record: JobRecord): EventEmitter {
  jobs.set(record.id, record);
  const emitter = new EventEmitter();
  emitter.setMaxListeners(20);
  emitters.set(record.id, emitter);
  return emitter;
}

export function getJob(id: string): JobRecord | undefined {
  return jobs.get(id);
}

export function getEmitter(id: string): EventEmitter | undefined {
  return emitters.get(id);
}

export function updateStatus(id: string, status: JobStatus) {
  const job = jobs.get(id);
  if (!job) return;
  job.status = status;
  emitters.get(id)?.emit('event', { type: 'status', status } satisfies JobEvent);
}

export function appendFinding(id: string, finding: Finding) {
  const job = jobs.get(id);
  if (!job) return;
  job.findings.push(finding);
  emitters.get(id)?.emit('event', { type: 'finding', finding } satisfies JobEvent);
}

export function appendFindings(id: string, findings: Finding[]) {
  for (const f of findings) appendFinding(id, f);
}

export function failJob(id: string, message: string) {
  const job = jobs.get(id);
  if (!job) return;
  job.status = 'failed';
  job.error = message;
  emitters.get(id)?.emit('event', { type: 'error', message } satisfies JobEvent);
}

export function completeJob(id: string, tokenUsage?: JobRecord['tokenUsage']) {
  const job = jobs.get(id);
  if (!job) return;
  job.status = 'completed';
  job.tokenUsage = tokenUsage;
  emitters.get(id)?.emit('event', { type: 'done', tokenUsage } satisfies JobEvent);
}