'use client';

import { useMemo } from 'react';
import type { Finding, Severity } from '@/server/types';

interface Props {
  findings: Finding[];
  fileCount: number;
  onSelect: (f: Finding) => void;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
  } | null;
}

const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 25,
  high: 10,
  medium: 3,
  low: 1,
  info: 0,
};

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

const SEVERITY_BAR: Record<Severity, string> = {
  critical: 'bg-red-600',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-sky-500',
  info: 'bg-slate-500',
};

export function Dashboard({ findings, fileCount, onSelect, tokenUsage }: Props) {
  const stats = useMemo(() => {
    const bySev: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    const byCategory = new Map<string, number>();
    const bySource = { pmd: 0, eslint: 0, claude: 0 };
    let weightedSum = 0;

    for (const f of findings) {
      bySev[f.severity] = (bySev[f.severity] ?? 0) + 1;
      byCategory.set(f.category || 'other', (byCategory.get(f.category || 'other') ?? 0) + 1);
      bySource[f.source] = (bySource[f.source] ?? 0) + 1;
      weightedSum += SEVERITY_WEIGHT[f.severity];
    }
    const score = Math.max(0, 100 - weightedSum);
    const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
    const sortedCategories = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]);
    return { bySev, byCategory: sortedCategories, bySource, score, grade, weightedSum };
  }, [findings]);

  const topIssues = useMemo(() => {
    return [...findings]
      .sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity])
      .slice(0, 5);
  }, [findings]);

  const maxSeverity = Math.max(...SEVERITY_ORDER.map((s) => stats.bySev[s]), 1);
  const maxCategory = Math.max(...stats.byCategory.map(([, c]) => c), 1);

  const gradeColor =
    stats.grade === 'A'
      ? 'text-emerald-600 dark:text-emerald-400'
      : stats.grade === 'B'
        ? 'text-sky-600 dark:text-sky-400'
        : stats.grade === 'C'
          ? 'text-yellow-600 dark:text-yellow-400'
          : stats.grade === 'D'
            ? 'text-orange-600 dark:text-orange-400'
            : 'text-red-600 dark:text-red-500';

  return (
    <section className="grid grid-cols-1 gap-4 rounded border border-slate-200 bg-white/70 p-5 dark:border-slate-800 dark:bg-slate-900/40 lg:grid-cols-4">
      <div className="flex flex-col items-center justify-center rounded border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
        <div className="text-[10px] uppercase tracking-wide text-slate-500">Code Quality</div>
        <div className={`text-6xl font-bold leading-none ${gradeColor}`}>{stats.grade}</div>
        <div className="mt-1 text-2xl font-semibold text-slate-700 dark:text-slate-300">{stats.score}/100</div>
        <div className="mt-2 text-[11px] text-slate-500">
          {findings.length} findings across {fileCount} {fileCount === 1 ? 'file' : 'files'}
        </div>
      </div>

      <div className="rounded border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          By severity
        </div>
        <div className="space-y-2">
          {SEVERITY_ORDER.map((sev) => {
            const count = stats.bySev[sev];
            const pct = (count / maxSeverity) * 100;
            return (
              <div key={sev} className="text-xs">
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <span className="capitalize">{sev}</span>
                  <span>{count}</span>
                </div>
                <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
                  <div className={`h-full ${SEVERITY_BAR[sev]}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          By category
        </div>
        {stats.byCategory.length === 0 ? (
          <div className="text-xs text-slate-500">No data.</div>
        ) : (
          <div className="space-y-2">
            {stats.byCategory.slice(0, 7).map(([cat, count]) => {
              const pct = (count / maxCategory) * 100;
              return (
                <div key={cat} className="text-xs">
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                    <span>{cat}</span>
                    <span>{count}</span>
                  </div>
                  <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
                    <div className="h-full bg-violet-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-3 border-t border-slate-200 pt-2 text-[10px] text-slate-500 dark:border-slate-800">
          PMD: {stats.bySource.pmd} · ESLint: {stats.bySource.eslint} · Claude: {stats.bySource.claude}
          {tokenUsage && <span> · cache hit: {tokenUsage.cacheReadInputTokens.toLocaleString()} tok</span>}
        </div>
      </div>

      <div className="rounded border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          Top issues to fix
        </div>
        {topIssues.length === 0 ? (
          <div className="text-xs text-slate-500">Nothing to action.</div>
        ) : (
          <ol className="space-y-2 text-xs">
            {topIssues.map((f, idx) => (
              <li key={f.id}>
                <button
                  onClick={() => onSelect(f)}
                  className="-m-1.5 w-full rounded p-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-900/60"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-slate-500">{idx + 1}.</span>
                    <div className="flex-1">
                      <div className="text-slate-800 dark:text-slate-200">{f.message}</div>
                      <div className="mt-0.5 text-[10px] text-slate-500">
                        <code>{f.ruleId}</code> · {f.file}
                        {f.line ? `:${f.line}` : ''}
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}