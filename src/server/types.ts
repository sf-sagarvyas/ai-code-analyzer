import 'server-only';

export type FileKind =
  | 'apex-class'
  | 'apex-trigger'
  | 'lwc-js'
  | 'lwc-html'
  | 'lwc-meta'
  | 'unknown';

export interface ReviewFile {
  path: string;
  kind: FileKind;
  content: string;
}

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type Source = 'pmd' | 'eslint' | 'claude';

export interface Finding {
  id: string;
  source: Source;
  ruleId: string;
  severity: Severity;
  category: string;
  file: string;
  line?: number;
  endLine?: number;
  message: string;
  rationale?: string;
  suggestion?: string;
}

export type JobStatus = 'queued' | 'static-pass' | 'semantic-pass' | 'completed' | 'failed';

export interface JobRecord {
  id: string;
  createdAt: string;
  status: JobStatus;
  model: string;
  files: ReviewFile[];
  findings: Finding[];
  error?: string;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
  };
}

export function fileKindFromPath(path: string): FileKind {
  const lower = path.toLowerCase();
  if (lower.endsWith('.cls')) return 'apex-class';
  if (lower.endsWith('.trigger')) return 'apex-trigger';
  if (lower.endsWith('.js')) return 'lwc-js';
  if (lower.endsWith('.html')) return 'lwc-html';
  if (lower.endsWith('.xml') && lower.includes('.js-meta.')) return 'lwc-meta';
  if (lower.endsWith('.xml')) return 'lwc-meta';
  return 'unknown';
}