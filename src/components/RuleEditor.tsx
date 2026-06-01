'use client';

import { useState } from 'react';

const APPLIES_TO = ['apex-class', 'apex-trigger', 'lwc-js', 'lwc-html', 'lwc-meta'] as const;
const SCOPES = ['apex', 'lwc', 'shared'] as const;
const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;

interface Props {
  onCreated: () => void;
  onCancel: () => void;
  existingCategories: string[];
}

export function RuleEditor({ onCreated, onCancel, existingCategories }: Props) {
  const [id, setId] = useState('CUSTOM-NEW-001');
  const [title, setTitle] = useState('');
  const [scope, setScope] = useState<(typeof SCOPES)[number]>('apex');
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>('medium');
  const [category, setCategory] = useState('custom');
  const [appliesTo, setAppliesTo] = useState<string[]>(['apex-class', 'apex-trigger']);
  const [rationale, setRationale] = useState('');
  const [badExample, setBadExample] = useState('');
  const [goodExample, setGoodExample] = useState('');
  const [references, setReferences] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleApplies(value: string) {
    setAppliesTo((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/guardrails/rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          title,
          scope,
          severity,
          category,
          appliesTo,
          rationale,
          badExample,
          goodExample,
          references,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'failed to create rule');
        return;
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'request failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/60"
    >
      <h3 className="text-sm font-semibold">Add a new rule</h3>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Rule ID">
          <input
            value={id}
            onChange={(e) => setId(e.target.value.toUpperCase())}
            placeholder="CUSTOM-NAMING-001"
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs font-mono dark:border-slate-700 dark:bg-slate-950"
          />
        </Field>
        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short imperative title"
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
          />
        </Field>
        <Field label="Scope">
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as (typeof SCOPES)[number])}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
          >
            {SCOPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Severity">
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as (typeof SEVERITIES)[number])}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Category">
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value.toLowerCase())}
            placeholder={existingCategories[0] ?? 'custom'}
            list="rule-categories"
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
          />
          <datalist id="rule-categories">
            {existingCategories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Applies to">
          <div className="flex flex-wrap gap-2 text-[11px]">
            {APPLIES_TO.map((v) => (
              <label key={v} className="flex items-center gap-1">
                <input type="checkbox" checked={appliesTo.includes(v)} onChange={() => toggleApplies(v)} />
                {v}
              </label>
            ))}
          </div>
        </Field>
      </div>

      <Field label="Rationale">
        <textarea
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          rows={3}
          placeholder="Why this rule matters — concrete failure mode, governor limit, security exposure, etc."
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Bad example (code)">
          <textarea
            value={badExample}
            onChange={(e) => setBadExample(e.target.value)}
            rows={5}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
          />
        </Field>
        <Field label="Good example (code)">
          <textarea
            value={goodExample}
            onChange={(e) => setGoodExample(e.target.value)}
            rows={5}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
          />
        </Field>
      </div>

      <Field label="References (comma-separated URLs)">
        <input
          value={references}
          onChange={(e) => setReferences(e.target.value)}
          placeholder="https://developer.salesforce.com/..., https://pmd.github.io/..."
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
        />
      </Field>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save rule'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-700 dark:text-slate-300">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}