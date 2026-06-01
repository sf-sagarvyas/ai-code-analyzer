import 'server-only';

import type { Finding, ReviewFile } from '../types';

// TODO(POC): Wire @lwc/eslint-plugin-lwc + @salesforce/eslint-config-lwc.
// Flat-config integration is fiddly enough that the POC leaves this as a stub;
// LWC files still get reviewed by Claude in the semantic pass.
export async function runEslint(_files: ReviewFile[]): Promise<Finding[]> {
  return [];
}