'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { Finding, Severity } from '@/server/types';

interface FileSummary {
  path: string;
  kind: string;
  content: string;
}

interface Props {
  files: FileSummary[];
  findings: Finding[];
  activeFile: string | null;
  onActiveFileChange: (path: string) => void;
  selectedFindingId?: string | null;
}

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

// Background and left-border styles for a code line that has a finding.
const SEVERITY_LINE_BG: Record<Severity, string> = {
  critical: 'bg-red-100 border-l-red-500 dark:bg-red-900/40',
  high: 'bg-orange-100 border-l-orange-500 dark:bg-orange-900/30',
  medium: 'bg-yellow-100 border-l-yellow-500 dark:bg-yellow-900/20',
  low: 'bg-sky-100 border-l-sky-500 dark:bg-sky-900/20',
  info: 'bg-slate-100 border-l-slate-500 dark:bg-slate-800/40',
};

export function CodePane({ files, findings, activeFile, onActiveFileChange, selectedFindingId }: Props) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const file = files.find((f) => f.path === activeFile) ?? files[0] ?? null;

  const findingCountByFile = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of findings) m.set(f.file, (m.get(f.file) ?? 0) + 1);
    return m;
  }, [findings]);

  const highestSeverityByLine = useMemo(() => {
    const m = new Map<number, Severity>();
    if (!file) return m;
    for (const f of findings) {
      if (f.file !== file.path || !f.line) continue;
      const prev = m.get(f.line);
      if (!prev || SEVERITY_RANK[f.severity] > SEVERITY_RANK[prev]) {
        m.set(f.line, f.severity);
      }
    }
    return m;
  }, [findings, file]);

  const selectedFinding = findings.find((f) => f.id === selectedFindingId) ?? null;

  useEffect(() => {
    if (!selectedFinding || !scrollerRef.current || !file) return;
    if (selectedFinding.file !== file.path) return;
    const line = selectedFinding.line;
    if (!line) return;
    const el = scrollerRef.current.querySelector<HTMLDivElement>(`[data-line="${line}"]`);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [selectedFinding, file]);

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center rounded border border-slate-200 bg-white text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950">
        No files in this review.
      </div>
    );
  }

  const lines = file.content.split('\n');

  return (
    <div className="flex h-full min-h-0 flex-col rounded border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      {/* Tab bar */}
      <div className="flex shrink-0 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
        {files.map((f) => {
          const count = findingCountByFile.get(f.path) ?? 0;
          const isActive = f.path === file.path;
          return (
            <button
              key={f.path}
              onClick={() => onActiveFileChange(f.path)}
              className={`flex shrink-0 items-center gap-2 border-r border-slate-200 px-3 py-1.5 text-xs dark:border-slate-800 ${
                isActive
                  ? 'bg-slate-100 text-slate-900 dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-900/50'
              }`}
            >
              <span>{f.path}</span>
              {count > 0 && (
                <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Code body */}
      <div ref={scrollerRef} className="flex-1 overflow-auto">
        <pre className="m-0 font-mono text-xs leading-5">
          {lines.map((line, idx) => {
            const lineNo = idx + 1;
            const sev = highestSeverityByLine.get(lineNo);
            const bg = sev ? SEVERITY_LINE_BG[sev] : 'border-l-transparent';
            const isSelectedLine = selectedFinding?.file === file.path && selectedFinding?.line === lineNo;
            return (
              <div
                key={lineNo}
                data-line={lineNo}
                className={`flex border-l-4 ${bg} ${isSelectedLine ? 'ring-1 ring-sky-500 dark:ring-sky-400' : ''}`}
              >
                <span className="w-12 select-none px-2 text-right text-slate-400 dark:text-slate-600">{lineNo}</span>
                <span className="flex-1 whitespace-pre px-2 text-slate-800 dark:text-slate-200">{line || ' '}</span>
              </div>
            );
          })}
        </pre>
      </div>
    </div>
  );
}