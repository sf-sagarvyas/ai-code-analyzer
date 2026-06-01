'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { CodePane } from '@/components/CodePane';
import { Dashboard } from '@/components/Dashboard';
import { FindingsList } from '@/components/FindingsList';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Uploader } from '@/components/Uploader';
import type { Finding, Severity } from '@/server/types';

interface ReviewFileSummary {
  path: string;
  kind: string;
  content: string;
}

type JobStatus = 'idle' | 'queued' | 'static-pass' | 'semantic-pass' | 'completed' | 'failed';

const STATUS_LABEL: Record<JobStatus, string> = {
  idle: 'Idle',
  queued: 'Queued',
  'static-pass': 'Running static analyzers (PMD/ESLint)…',
  'semantic-pass': 'Running semantic review (Claude)…',
  completed: 'Review complete',
  failed: 'Review failed',
};

export default function Page() {
  const [status, setStatus] = useState<JobStatus>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [files, setFiles] = useState<ReviewFileSummary[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [selected, setSelected] = useState<Finding | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokenUsage, setTokenUsage] = useState<{
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
  } | null>(null);
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const isRunning = status === 'queued' || status === 'static-pass' || status === 'semantic-pass';
  const hasReview = files.length > 0 || findings.length > 0;

  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      if (severityFilter !== 'all' && f.severity !== severityFilter) return false;
      if (categoryFilter !== 'all' && (f.category || 'other') !== categoryFilter) return false;
      return true;
    });
  }, [findings, severityFilter, categoryFilter]);

  async function handleSubmit(formData: FormData) {
    setStatus('queued');
    setFindings([]);
    setSelected(null);
    setError(null);
    setTokenUsage(null);
    setSeverityFilter('all');
    setCategoryFilter('all');
    setActiveFile(null);

    const res = await fetch('/api/review', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) {
      setStatus('failed');
      setError(data.error ?? 'submission failed');
      return;
    }
    setJobId(data.jobId);

    const detail = await fetch(`/api/review/${data.jobId}`).then((r) => r.json());
    const detailFiles: ReviewFileSummary[] = detail.files ?? [];
    setFiles(detailFiles);
    if (detailFiles.length > 0) setActiveFile(detailFiles[0].path);
  }

  function handleSelectFinding(f: Finding) {
    setSelected(f);
    if (f.file && f.file !== activeFile && files.some((file) => file.path === f.file)) {
      setActiveFile(f.file);
    }
  }

  async function handleRerun() {
    if (!jobId || isRunning) return;
    setFindings([]);
    setSelected(null);
    setError(null);
    setTokenUsage(null);
    setSeverityFilter('all');
    setCategoryFilter('all');
    setStatus('queued');
    const res = await fetch(`/api/review/${jobId}/rerun`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      setStatus('failed');
      setError(data.error ?? 'rerun failed');
      return;
    }
    setJobId(data.jobId);
  }

  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`/api/review/${jobId}/stream`);
    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.type === 'status') setStatus(data.status);
        else if (data.type === 'finding') setFindings((prev) => [...prev, data.finding]);
        else if (data.type === 'done') {
          setStatus('completed');
          setTokenUsage(data.tokenUsage ?? null);
          es.close();
        } else if (data.type === 'error') {
          setStatus('failed');
          setError(data.message);
          es.close();
        }
      } catch (e) {
        console.error('parse error', e);
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [jobId]);

  return (
    <main className="mx-auto flex max-w-[1400px] flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">
          AI Code Analyzer{' '}
          <span className="text-sm font-normal text-slate-600 dark:text-slate-400">— Salesforce APEX & LWC</span>
        </h1>
        <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
          <span>
            <span className="mr-1.5">Status:</span>
            <span
              className={
                status === 'failed' ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-200'
              }
            >
              {STATUS_LABEL[status]}
            </span>
          </span>
          <button
            type="button"
            onClick={handleRerun}
            disabled={!jobId || isRunning}
            title={jobId ? 'Re-run the review on the same files (e.g., after editing guardrails)' : 'Run a review first'}
            className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-500"
          >
            ↻ Refresh
          </button>
          <Link
            href="/guardrails"
            title="Guardrails Configuration"
            className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-500"
          >
            ⚙ Guardrails
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <Uploader onSubmit={handleSubmit} disabled={isRunning} />

      {error && <div className="rounded border border-red-700 bg-red-900/30 p-3 text-sm text-red-200">{error}</div>}

      {hasReview && (
        <>
          {/* Top: code + findings, fixed height with internal scroll */}
          <section
            className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_440px]"
            style={{ height: 'calc(100vh - 360px)', minHeight: 480 }}
          >
            <CodePane
              files={files}
              findings={filteredFindings}
              activeFile={activeFile}
              onActiveFileChange={setActiveFile}
              selectedFindingId={selected?.id}
            />
            <FindingsList
              findings={filteredFindings}
              allFindings={findings}
              onSelect={handleSelectFinding}
              selectedId={selected?.id ?? null}
              severityFilter={severityFilter}
              onSeverityFilterChange={setSeverityFilter}
              categoryFilter={categoryFilter}
              onCategoryFilterChange={setCategoryFilter}
            />
          </section>

          {/* Bottom: dashboard */}
          <Dashboard
            findings={findings}
            fileCount={files.length}
            onSelect={handleSelectFinding}
            tokenUsage={tokenUsage}
          />
        </>
      )}
    </main>
  );
}