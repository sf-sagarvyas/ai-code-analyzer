'use client';

import { useMemo } from 'react';
import type { Finding, Severity } from '@/server/types';

interface Props {
  findings: Finding[];
  allFindings: Finding[];
  onSelect: (f: Finding) => void;
  selectedId?: string | null;
  severityFilter: Severity | 'all';
  onSeverityFilterChange: (s: Severity | 'all') => void;
  categoryFilter: string;
  onCategoryFilterChange: (c: string) => void;
}

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

const SEVERITY_PILL: Record<string, string> = {
  critical: 'bg-red-700 text-white',
  high: 'bg-orange-600 text-white',
  medium: 'bg-yellow-600 text-slate-900',
  low: 'bg-sky-600 text-white',
  info: 'bg-slate-600 text-white',
};

const SOURCE_PILL: Record<string, string> = {
  pmd: 'bg-emerald-700 text-white',
  eslint: 'bg-teal-700 text-white',
  claude: 'bg-violet-700 text-white',
};

export function FindingsList({
  findings,
  allFindings,
  onSelect,
  selectedId,
  severityFilter,
  onSeverityFilterChange,
  categoryFilter,
  onCategoryFilterChange,
}: Props) {
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const f of allFindings) set.add(f.category || 'other');
    return Array.from(set).sort();
  }, [allFindings]);

  const grouped = useMemo(() => {
    const map = new Map<Severity, Finding[]>();
    for (const f of findings) {
      const arr = map.get(f.severity) ?? [];
      arr.push(f);
      map.set(f.severity, arr);
    }
    return map;
  }, [findings]);

  return (
    <div className="flex h-full min-h-0 flex-col rounded border border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-900/40">
      {/* Filter bar */}
      <div className="shrink-0 space-y-2 border-b border-slate-200 p-3 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Severity</span>
          <FilterChip
            active={severityFilter === 'all'}
            onClick={() => onSeverityFilterChange('all')}
            label={`All (${allFindings.length})`}
          />
          {SEVERITY_ORDER.map((sev) => {
            const count = allFindings.filter((f) => f.severity === sev).length;
            if (count === 0) return null;
            return (
              <FilterChip
                key={sev}
                active={severityFilter === sev}
                onClick={() => onSeverityFilterChange(sev)}
                label={`${sev} (${count})`}
                color={SEVERITY_PILL[sev]}
              />
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Category</span>
          <FilterChip
            active={categoryFilter === 'all'}
            onClick={() => onCategoryFilterChange('all')}
            label="All"
          />
          {categories.map((cat) => {
            const count = allFindings.filter((f) => (f.category || 'other') === cat).length;
            return (
              <FilterChip
                key={cat}
                active={categoryFilter === cat}
                onClick={() => onCategoryFilterChange(cat)}
                label={`${cat} (${count})`}
              />
            );
          })}
        </div>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {findings.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            {allFindings.length === 0
              ? 'No findings yet. Run a review to populate this panel.'
              : 'No findings match the current filters.'}
          </div>
        ) : (
          <div className="space-y-3">
            {SEVERITY_ORDER.map((sev) => {
              const items = grouped.get(sev);
              if (!items || items.length === 0) return null;
              return (
                <section key={sev}>
                  <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${SEVERITY_PILL[sev]}`}>{sev}</span>
                    <span>{items.length}</span>
                  </h3>
                  <ul className="space-y-2">
                    {items.map((f) => (
                      <li key={f.id}>
                        <button
                          onClick={() => onSelect(f)}
                          className={`w-full rounded border p-2 text-left text-xs transition ${
                            selectedId === f.id
                              ? 'border-sky-500 bg-sky-50 dark:bg-slate-800'
                              : 'border-slate-200 bg-white hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                          }`}
                        >
                          <div className="mb-1 flex flex-wrap items-center gap-1.5">
                            <span className={`rounded px-1.5 py-0.5 text-[10px] ${SOURCE_PILL[f.source]}`}>
                              {f.source}
                            </span>
                            <code className="text-[11px] text-slate-700 dark:text-slate-300">{f.ruleId}</code>
                            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-400">
                              {f.category}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              {f.file}
                              {f.line ? `:${f.line}` : ''}
                            </span>
                          </div>
                          <div className="text-slate-800 dark:text-slate-200">{f.message}</div>
                          {f.rationale && (
                            <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">{f.rationale}</p>
                          )}
                          {f.suggestion && (
                            <pre className="mt-1.5 overflow-auto rounded bg-slate-100 p-1.5 text-[11px] text-emerald-700 dark:bg-slate-950 dark:text-emerald-300">
                              {f.suggestion}
                            </pre>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  color,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2 py-0.5 text-[11px] transition ${
        active
          ? color
            ? `${color} border-transparent`
            : 'border-sky-500 bg-sky-600 text-white'
          : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-500'
      }`}
    >
      {label}
    </button>
  );
}