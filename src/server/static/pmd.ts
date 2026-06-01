import 'server-only';

import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { loadPmdIndex } from '../guardrails/loader';
import { getDisabledRuleIds } from '../guardrails/config';
import type { Finding, ReviewFile, Severity } from '../types';

interface PmdViolation {
  beginline: number;
  endline: number;
  rule: string;
  ruleset: string;
  priority: number;
  description: string;
}

interface PmdFileReport {
  filename: string;
  violations: PmdViolation[];
}

interface PmdReport {
  files: PmdFileReport[];
  processingErrors?: Array<{ filename: string; message: string }>;
}

const APEX_RULESET = 'category/apex/bestpractices.xml,category/apex/codestyle.xml,category/apex/design.xml,category/apex/errorprone.xml,category/apex/performance.xml,category/apex/security.xml';

export async function runPmd(files: ReviewFile[]): Promise<Finding[]> {
  const apexFiles = files.filter((f) => f.kind === 'apex-class' || f.kind === 'apex-trigger');
  if (apexFiles.length === 0) return [];

  const pmdHome = resolve(process.cwd(), process.env.PMD_HOME ?? './bin/pmd');
  const pmdBin = join(pmdHome, 'bin', process.platform === 'win32' ? 'pmd.bat' : 'pmd');
  if (!existsSync(pmdBin)) {
    console.warn(`[pmd] not found at ${pmdBin}. Run 'npm run setup:pmd'. Skipping static pass.`);
    return [];
  }

  const workDir = await mkdtemp(join(tmpdir(), 'aica-pmd-'));
  try {
    for (const f of apexFiles) {
      const full = join(workDir, f.path);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, f.content, 'utf-8');
    }

    const reportPath = join(workDir, '_report.json');
    const args = ['check', '-d', workDir, '-R', APEX_RULESET, '-f', 'json', '-r', reportPath, '--no-progress'];

    const exit = await new Promise<number>((resolveExit) => {
      const child = spawn(pmdBin, args, { shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.on('data', () => {});
      child.stderr.on('data', (d) => console.warn(`[pmd stderr] ${d}`));
      child.on('error', (e) => {
        console.error('[pmd] spawn error', e);
        resolveExit(-1);
      });
      child.on('close', (code) => resolveExit(code ?? 0));
    });

    // PMD exits non-zero (4) when violations are found — that's success.
    if (exit !== 0 && exit !== 4) {
      console.warn(`[pmd] exited with code ${exit}; no findings produced.`);
      return [];
    }

    const { readFile } = await import('node:fs/promises');
    let report: PmdReport;
    try {
      report = JSON.parse(await readFile(reportPath, 'utf-8'));
    } catch {
      return [];
    }

    const findings: Finding[] = [];
    for (const fileReport of report.files ?? []) {
      const relPath = fileReport.filename.replace(workDir, '').replace(/^[\\/]/, '').replace(/\\/g, '/');
      for (const v of fileReport.violations) {
        findings.push({
          id: randomUUID(),
          source: 'pmd',
          ruleId: v.rule,
          severity: priorityToSeverity(v.priority),
          category: v.ruleset.split('/').pop() ?? 'unknown',
          file: relPath,
          line: v.beginline,
          endLine: v.endline,
          message: v.description,
        });
      }
    }
    return await enrichWithGuardrails(findings);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

function priorityToSeverity(priority: number): Severity {
  switch (priority) {
    case 1:
      return 'critical';
    case 2:
      return 'high';
    case 3:
      return 'medium';
    case 4:
      return 'low';
    default:
      return 'info';
  }
}

async function enrichWithGuardrails(findings: Finding[]): Promise<Finding[]> {
  if (findings.length === 0) return findings;
  let index: Awaited<ReturnType<typeof loadPmdIndex>>;
  let disabled: Set<string>;
  try {
    [index, disabled] = await Promise.all([loadPmdIndex(), getDisabledRuleIds()]);
  } catch (e) {
    console.warn('[pmd] could not load guardrail index/config, leaving findings unenriched:', e);
    return findings;
  }
  let mapped = 0;
  let suppressed = 0;
  const enriched: Finding[] = [];
  for (const f of findings) {
    const key = f.ruleId.toLowerCase();
    const rule = index.get(key);
    if (rule) {
      if (disabled.has(rule.id)) {
        suppressed++;
        continue;
      }
      mapped++;
      enriched.push({
        ...f,
        category: rule.category,
        rationale: rule.rationale,
        suggestion: rule.goodExample ? `Follow ${rule.id}:\n${rule.goodExample}` : undefined,
      });
    } else {
      enriched.push({
        ...f,
        rationale: `PMD rule — see https://pmd.github.io/pmd/pmd_rules_apex.html#${key}`,
      });
    }
  }
  console.log(
    `[pmd] enriched ${mapped}/${findings.length} findings, suppressed ${suppressed} via disabled guardrails`,
  );
  return enriched;
}