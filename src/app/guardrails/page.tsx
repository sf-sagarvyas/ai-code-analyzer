'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RuleEditor } from '@/components/RuleEditor';
import { ThemeToggle } from '@/components/ThemeToggle';

interface Rule {
  id: string;
  title: string;
  severity: string;
  category: string;
  scope: 'apex' | 'lwc' | 'shared';
  appliesTo: string[];
  rationale: string;
  badExample?: string;
  goodExample?: string;
  references?: string;
  pmdRuleIds: string[];
  sourcePackTitle: string;
  enabled: boolean;
}

const SEVERITY_PILL: Record<string, string> = {
  critical: 'bg-red-700 text-white',
  high: 'bg-orange-600 text-white',
  medium: 'bg-yellow-600 text-slate-900',
  low: 'bg-sky-600 text-white',
  info: 'bg-slate-600 text-white',
};

export default function GuardrailsPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scopeFilter, setScopeFilter] = useState<'all' | 'apex' | 'lwc' | 'shared'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showEditor, setShowEditor] = useState(false);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/guardrails');
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'failed to load rules');
        return;
      }
      setRules(data.rules ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'request failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  async function toggleRule(rule: Rule) {
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)));
    try {
      const res = await fetch('/api/guardrails/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleId: rule.id, enabled: !rule.enabled }),
      });
      if (!res.ok) {
        setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: rule.enabled } : r)));
      }
    } catch {
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: rule.enabled } : r)));
    }
  }

  async function toggleGroup(groupRules: Rule[], enabled: boolean) {
    const ids = groupRules.map((r) => r.id);
    const idSet = new Set(ids);
    const prev = rules;
    setRules((current) => current.map((r) => (idSet.has(r.id) ? { ...r, enabled } : r)));
    try {
      const res = await fetch('/api/guardrails/toggle-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleIds: ids, enabled }),
      });
      if (!res.ok) setRules(prev);
    } catch {
      setRules(prev);
    }
  }

  function toggleExpand(id: string) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  }

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const r of rules) s.add(r.category);
    return Array.from(s).sort();
  }, [rules]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rules.filter((r) => {
      if (scopeFilter !== 'all' && r.scope !== scopeFilter) return false;
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      if (statusFilter === 'enabled' && !r.enabled) return false;
      if (statusFilter === 'disabled' && r.enabled) return false;
      if (q && !(r.id.toLowerCase().includes(q) || r.title.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rules, scopeFilter, categoryFilter, statusFilter, search]);

  const grouped = useMemo(() => {
    const m = new Map<string, Rule[]>();
    for (const r of filtered) {
      const key = `${r.scope}/${r.category}`;
      const arr = m.get(key) ?? [];
      arr.push(r);
      m.set(key, arr);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const enabledCount = rules.filter((r) => r.enabled).length;

  return (
    <main className="mx-auto flex max-w-[1400px] flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Guardrails Configuration</h1>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {rules.length} rules total · {enabledCount} enabled · {rules.length - enabledCount} disabled
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="rounded border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-500"
          >
            ← Back to review
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <section className="space-y-3 rounded border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <FilterGroup label="Scope">
            <FilterChip active={scopeFilter === 'all'} onClick={() => setScopeFilter('all')} label="All" />
            {(['apex', 'lwc', 'shared'] as const).map((s) => (
              <FilterChip
                key={s}
                active={scopeFilter === s}
                onClick={() => setScopeFilter(s)}
                label={`${s} (${rules.filter((r) => r.scope === s).length})`}
              />
            ))}
          </FilterGroup>

          <FilterGroup label="Status">
            <FilterChip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} label="All" />
            <FilterChip
              active={statusFilter === 'enabled'}
              onClick={() => setStatusFilter('enabled')}
              label={`Enabled (${enabledCount})`}
            />
            <FilterChip
              active={statusFilter === 'disabled'}
              onClick={() => setStatusFilter('disabled')}
              label={`Disabled (${rules.length - enabledCount})`}
            />
          </FilterGroup>

          <div className="md:col-span-2 flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1 text-[10px] uppercase tracking-wide text-slate-500">
              Search
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="rule id or title…"
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
              />
            </label>
            <button
              onClick={() => setShowEditor((s) => !s)}
              className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
            >
              {showEditor ? 'Close editor' : '+ Add rule'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Category</span>
          <FilterChip active={categoryFilter === 'all'} onClick={() => setCategoryFilter('all')} label="All" />
          {categories.map((c) => (
            <FilterChip
              key={c}
              active={categoryFilter === c}
              onClick={() => setCategoryFilter(c)}
              label={`${c} (${rules.filter((r) => r.category === c).length})`}
            />
          ))}
        </div>
      </section>

      {showEditor && (
        <RuleEditor
          existingCategories={categories}
          onCancel={() => setShowEditor(false)}
          onCreated={() => {
            setShowEditor(false);
            fetchRules();
          }}
        />
      )}

      {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">{error}</div>}
      {loading && <div className="text-sm text-slate-500">Loading rules…</div>}

      {!loading && grouped.length === 0 && (
        <div className="rounded border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          No rules match the current filters.
        </div>
      )}

      <div className="space-y-4">
        {grouped.map(([groupKey, items]) => {
          const enabledInGroup = items.filter((r) => r.enabled).length;
          const allEnabled = enabledInGroup === items.length;
          const noneEnabled = enabledInGroup === 0;
          const nextEnabled = !allEnabled; // mixed or all-disabled → enable all; all-enabled → disable all
          return (
          <section key={groupKey}>
            <div className="mb-2 flex items-center justify-between gap-3 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 dark:border-slate-800 dark:bg-slate-900/40">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={allEnabled}
                  ref={(el) => {
                    if (el) el.indeterminate = !allEnabled && !noneEnabled;
                  }}
                  onChange={() => toggleGroup(items, nextEnabled)}
                  title={nextEnabled ? `Enable all ${items.length} rules in this group` : `Disable all ${items.length} rules in this group`}
                />
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                  {groupKey}
                </h2>
                <span className="text-[11px] text-slate-500">
                  {enabledInGroup}/{items.length} enabled
                </span>
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(items, true)}
                  disabled={allEnabled}
                  className="rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-700 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500"
                >
                  Enable all
                </button>
                <button
                  type="button"
                  onClick={() => toggleGroup(items, false)}
                  disabled={noneEnabled}
                  className="rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-700 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500"
                >
                  Disable all
                </button>
              </div>
            </div>
            <ul className="space-y-1.5">
              {items.map((r) => {
                const isOpen = expanded.has(r.id);
                return (
                  <li
                    key={r.id}
                    className={`rounded border ${
                      r.enabled
                        ? 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                        : 'border-slate-200 bg-slate-50 opacity-70 dark:border-slate-800 dark:bg-slate-900/40'
                    }`}
                  >
                    <div className="flex items-start gap-2 p-2.5">
                      <input
                        type="checkbox"
                        checked={r.enabled}
                        onChange={() => toggleRule(r)}
                        className="mt-1"
                        title={r.enabled ? 'Disable this rule' : 'Enable this rule'}
                      />
                      <div className="flex-1 min-w-0">
                        <button onClick={() => toggleExpand(r.id)} className="flex w-full items-start gap-2 text-left">
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${SEVERITY_PILL[r.severity] ?? 'bg-slate-500 text-white'}`}>
                            {r.severity}
                          </span>
                          <code className="shrink-0 text-[11px] text-slate-700 dark:text-slate-300">{r.id}</code>
                          <span className="flex-1 truncate text-xs text-slate-800 dark:text-slate-200">{r.title}</span>
                          <span className="shrink-0 text-[10px] text-slate-500">{isOpen ? '▾' : '▸'}</span>
                        </button>
                        {isOpen && (
                          <div className="mt-2 space-y-2 text-xs">
                            <div className="text-slate-700 dark:text-slate-300">{r.rationale}</div>
                            <div className="text-[11px] text-slate-500">
                              Applies to: {r.appliesTo.join(', ') || '—'} · Source: {r.sourcePackTitle}.md
                              {r.pmdRuleIds.length > 0 && <> · PMD: {r.pmdRuleIds.join(', ')}</>}
                            </div>
                            {r.badExample && (
                              <details>
                                <summary className="cursor-pointer text-[11px] text-slate-600 dark:text-slate-400">Bad example</summary>
                                <pre className="mt-1 overflow-auto rounded bg-slate-100 p-2 font-mono text-[11px] text-red-700 dark:bg-slate-950 dark:text-red-300">
                                  {r.badExample}
                                </pre>
                              </details>
                            )}
                            {r.goodExample && (
                              <details>
                                <summary className="cursor-pointer text-[11px] text-slate-600 dark:text-slate-400">Good example</summary>
                                <pre className="mt-1 overflow-auto rounded bg-slate-100 p-2 font-mono text-[11px] text-emerald-700 dark:bg-slate-950 dark:text-emerald-300">
                                  {r.goodExample}
                                </pre>
                              </details>
                            )}
                            {r.references && (
                              <div className="text-[11px] text-slate-500">References: {r.references}</div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
          );
        })}
      </div>
    </main>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2 py-0.5 text-[11px] transition ${
        active
          ? 'border-sky-500 bg-sky-600 text-white'
          : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-500'
      }`}
    >
      {label}
    </button>
  );
}