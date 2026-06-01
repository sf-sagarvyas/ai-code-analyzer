
# Salesforce Guardrails

This directory holds the rule packs that drive the semantic-review phase
of the AI Code

Analyzer. Every file here is both a human-facing engineering standard
AND the prompt

context the LLM sees when reviewing Salesforce code.

The deterministic pre-pass (PMD for Apex, ESLint +
`@lwc/eslint-plugin-lwc` for LWC)

already catches syntactic and trivially-mechanical violations. The rules
in this

directory target judgment-calls that need an LLM with project context:
bulkification

patterns, sharing-model intent, async architecture trade-offs,
reactivity correctness,

accessibility, and long-term governance.

## How the analyzer uses these files

1. The analyzer identifies the file under review (Apex class, Apex
trigger, LWC `.js`,

LWC `.html`, or LWC `*-meta.xml`).

2. It loads only the rule packs whose `**Applies to:**` line includes
that file type.

This keeps the prompt focused — an LWC review does not need to see Apex
bulkification

rules.

3. The selected rules are appended verbatim to the system prompt sent to
Claude, along

with the deterministic findings from PMD/ESLint.

4. Claude returns structured findings keyed by rule ID. The IDs are
stable; renaming or

deleting a rule ID will break historical reports.

## Directory layout

```

guardrails/

├── README.md (this file)

├── apex/

│ ├── security.md CRUD/FLS, sharing, injection, secrets, crypto, CSRF,
XSS

│ ├── performance.md Bulkification, SOQL/DML, governor limits, async
patterns

│ ├── architecture.md Trigger-handler, selector/service/domain,
recursion

│ ├── naming.md Class/method/variable conventions, test naming

│ ├── testing.md Coverage, assertions, mocking, bulk-safety tests

│ └── governance.md API version, deprecation, ownership, feature flags

├── lwc/

│ ├── reactivity.md @api/@track/@wire, lifecycle hooks, conditional
render

│ ├── performance.md Render cost, lazy loading, caching, debouncing

│ ├── accessibility.md Labels, semantic HTML, focus order, sa11y/jest

│ ├── security.md innerHTML, eval, event scoping, CDN scripts

│ ├── testing.md Jest setup, wire adapter mocking, event assertions

│ └── governance.md apiVersion, targets, @api stability, custom labels,
LMS

└── shared/

└── documentation.md ApexDoc/JSDoc, comment quality, stale-comment
hygiene

```

## Rule format

Every rule in every file follows the exact shape below. The format is
not negotiable —

the analyzer parses it. Rule IDs are stable across releases; tombstone
(don't delete)

when retiring a rule.

```markdown

## RULE <CODE>: <Short imperative title (≤80 chars)>

**Severity:** critical | high | medium | low

**Category:** security | performance | architecture | naming | testing |
governance |

reactivity | accessibility | documentation

**Applies to:** apex-class, apex-trigger, lwc-js, lwc-html, lwc-meta

**Rationale:** 2–4 sentences explaining WHY this matters, the realistic
failure mode,

and concrete numbers where possible.

**Detection signals:**

- specific keywords/patterns/API calls to look for in code

**Bad example:**

```apex

<minimal, realistic, ≤15 lines>

```

**Good example:**

```apex

<the fix, same shape>

```

**References:** comma-separated URLs to authoritative sources.

```

### A fully-worked example

```markdown

## RULE APEX-PERF-002: No DML inside a for/while/do-while loop

**Severity:** critical

**Category:** performance

**Applies to:** apex-class, apex-trigger

**Rationale:** The DML statement limit is 150 per transaction. A `update
record;`

call inside a loop processing more than 150 records throws
`LimitException` and the

entire transaction rolls back. Collect modified records into a `List`
and execute

one DML statement per SObject type outside the loop.

**Detection signals:**

- `insert`, `update`, `upsert`, `delete`, `merge` statements or
`Database.*` calls

inside a loop body.

**Bad example:**

\```apex

for (Contact c : contacts) {

c.Status__c = 'Inactive';

update c;

}

\```

**Good example:**

\```apex

for (Contact c : contacts) { c.Status__c = 'Inactive'; }

update contacts;

\```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_gov_limits.htm,
https://pmd.github.io/pmd/pmd_rules_apex.html#operationwithlimitsinloop

```

## Severity scale

Use these crisp criteria. If a rule could plausibly belong in two tiers,
pick the higher

one.

| Severity | Definition | Examples |

|---|---|---|

| **critical** | Exploitable security vulnerability, data-loss path, or
guaranteed transaction failure in realistic production traffic. Must
block release. | SOQL injection, hardcoded crypto key, DML/SOQL in loop,
missing sharing on a class that handles PII. |

| **high** | Causes production incidents under realistic load or in
common edge cases. Should block release unless an explicit waiver is
filed. | Non-selective query on a large object, recursive trigger
without guard, missing FLS check in system-mode code, unsanitized URL
parameter rendered to UI. |

| **medium** | Degrades code quality, maintainability, or
future-extensibility. Ship-blocker only if it is the team's standard;
otherwise fix in the same PR or open a follow-up. | Missing test for an
error branch, getter doing expensive work, no service layer,
inconsistent naming. |

| **low** | Style or preference. Reviewer discretion; encouraged but not
required for release. | Missing `LoggingLevel` on `System.debug`,
missing JSDoc on private helper, suboptimal comment. |

The analyzer reports findings grouped by severity. Critical findings
block the merge

check; high require an explicit waiver comment; medium and low are
advisory.

## Category list

| Category | What belongs here |

|---|---|

| **security** | Anything an attacker could exploit: injection, auth
bypass, secret leakage, XSS, CSRF, unsafe redirects, missing CRUD/FLS,
missing sharing. |

| **performance** | Anything that fails or slows under realistic load:
SOQL/DML in loops, non-selective queries, governor limit pressure, heap
pressure, render cost in LWC, caching strategy. |

| **architecture** | Structural concerns: layering, trigger-handler
pattern, recursion control, exception design, dependency direction. |

| **naming** | Identifier conventions for classes, methods, fields,
files. |

| **testing** | Test structure, coverage targets, mocking, bulk-test
discipline, assertion quality. |

| **governance** | Concerns that show up over multi-year horizons: API
version pinning, deprecation discipline, monitoring/observability hooks,
feature flags, code ownership, managed-package considerations. |

| **reactivity** | LWC-specific: `@api`/`@track`/`@wire`, lifecycle
hooks, conditional rendering, state mutation semantics. |

| **accessibility** | LWC-specific: WCAG conformance, labels, semantic
HTML, focus management, color use. |

| **documentation** | Comment quality, ApexDoc/JSDoc presence,
stale-comment hygiene. |

## Adding a new rule

1. Choose the right file (use category + Applies-to as the deciding
factor).

2. Pick the next sequential ID for that file (e.g., next after
`APEX-PERF-015` is

`APEX-PERF-016`). Never reuse IDs of deprecated rules.

3. Author the rule using the format above. Confirm:

- Bad and good examples compile / parse.

- At least one authoritative reference (Salesforce official docs, PMD
rule, ESLint

rule, fflib doc).

- Detection signals are concrete — name keywords and API calls, not
"looks suspicious".

4. Open a PR with the rule. The PR description should explain what
production failure

the rule prevents and which deterministic tool already catches partial
overlap (if

any).

## Changing a severity

Severity changes are visible in the PR diff. Note in the commit message
why the change

is justified (incident report, internal policy update, etc.). The
analyzer rereads

severity on every run; no migration needed.

## Deprecating a rule (tombstone, don't delete)

Historical analyzer reports cite rules by ID. Deleting a rule breaks
those reports

and confuses anyone investigating an old finding. Instead, mark the rule
with a status

banner:

```markdown

## RULE APEX-PERF-099: Avoid `Database.executeBatch` for sub-1000 record
jobs

**Status: deprecated 2026-04-01.** Replaced by APEX-PERF-104 (decide
between Queueable

and Batch based on chunking requirements, not record count).

**Severity:** medium

...

```

Keep the rest of the rule body intact. The analyzer stops applying
deprecated rules but

preserves them for backward report compatibility.

## Notes on `Applies to`

The `**Applies to:**` line is a comma-separated list of file types:

- `apex-class` — `.cls` files

- `apex-trigger` — `.trigger` files

- `lwc-js` — `.js` files inside an LWC bundle

- `lwc-html` — `.html` files inside an LWC bundle

- `lwc-meta` — `*.js-meta.xml` / `*.cls-meta.xml` files (used by LWC and
Apex governance rules)

The analyzer loads only the rule packs whose Applies-to list intersects
with the file

being reviewed. This keeps prompts focused and reduces the chance the
LLM mis-applies an

Apex rule to LWC code or vice versa. Be precise — listing every file
type on every rule

defeats the purpose.
