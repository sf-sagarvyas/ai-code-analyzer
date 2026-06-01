import 'server-only';

import { runEslint } from './static/eslint';
import { runPmd } from './static/pmd';
import { runSemanticPass } from './semantic/claude';
import {
  appendFindings,
  completeJob,
  failJob,
  updateStatus,
} from './jobStore';
import type { ReviewFile } from './types';

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-5';

export async function runReview(jobId: string, files: ReviewFile[], model = DEFAULT_MODEL) {
  try {
    updateStatus(jobId, 'static-pass');
    const [pmdFindings, eslintFindings] = await Promise.all([runPmd(files), runEslint(files)]);
    const staticFindings = [...pmdFindings, ...eslintFindings];
    appendFindings(jobId, staticFindings);
    console.log(
      `[orchestrator] job=${jobId} static-pass complete pmd=${pmdFindings.length} eslint=${eslintFindings.length}`,
    );

    updateStatus(jobId, 'semantic-pass');
    const semantic = await runSemanticPass(files, staticFindings, model);
    appendFindings(jobId, semantic.findings);
    console.log(`[orchestrator] job=${jobId} semantic-pass complete claude=${semantic.findings.length}`);

    completeJob(jobId, semantic.tokenUsage);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[orchestrator] job ${jobId} failed:`, err);
    failJob(jobId, message);
  }
}