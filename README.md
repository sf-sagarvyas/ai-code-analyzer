# AI Code Analyzer — Salesforce APEX & LWC Review (POC)

Local proof-of-concept for an AI-assisted code review tool for Salesforce
APEX classes/triggers and Lightning Web Components. Runs PMD for
deterministic static rules, then asks Claude for semantic review using the
guardrail rule packs in `guardrails/`.

## Prerequisites

- Node 20+ (verified on 24)
- Java 11+ (verified on 17) — required by PMD
- An LLM credential, one of:
  - **Anthropic API** key (-managed proxy) — get one at https://dev.fuelix.ai
  - Direct Anthropic API key — https://console.anthropic.com/

## Setup

```powershell
npm install
npm run setup:pmd # downloads PMD 7 into ./bin/pmd
Copy-Item .env.local.example .env.local
# edit .env.local — see the two paths in the example file (Anthropic API or direct)
npm run dev
```

Open http://localhost:3000 in your browser.

Then in the UI's model dropdown, pick **Sonnet 4.5 (Anthropic API default)**.

> **Note on prompt caching:** the POC sends `cache_control` blocks expecting
> Anthropic's prompt-cache to reuse the system + guardrails prompt across
> requests. If Anthropic API strips that field, requests still succeed but
> `cacheReadInputTokens` will stay at 0. No code change needed.

## What works in this POC

- Paste APEX/LWC code or upload `.cls`, `.trigger`, `.js`, `.html`, `.xml`,
  or `.zip` files.
- Static pass: PMD runs against APEX with the Salesforce ruleset.
- Semantic pass: Claude reviews the bundle using the Markdown guardrail
  packs in `guardrails/` (loaded server-side, filtered by file type).
- Prompt caching is enabled on the system + guardrails blocks so repeat
  reviews are cheap.
- Findings stream to the UI via Server-Sent Events.

## What is stubbed / deferred

- **ESLint for LWC** — runner is a stub that returns no findings. LWC files
  still get reviewed by Claude. Wiring `@lwc/eslint-plugin-lwc` is the
  next-most-valuable upgrade.
- **GitHub/Bitbucket PR ingestion** — not in the POC.
- **SFDX org pull** — not in the POC.
- **SSO / multi-user** — localhost only, no auth.
- **Postgres / Redis / BullMQ** — in-memory job store; jobs are lost on
  server restart.

## Project layout

```
guardrails/   Markdown rule packs (the source of review standards)
src/app/      Next.js app router pages + API routes
src/components/ UI components
src/server/   Server-only: orchestrator, analyzers, Claude client
bin/pmd/      PMD 7 CLI (gitignored, populated by setup:pmd)
scripts/      One-off scripts (PMD download, etc.)
```

## Editing the guardrails

See [`guardrails/README.md`](guardrails/README.md). Markdown changes are
picked up on every review (no rebuild needed).

## Configuration

`.env.local`:

| Variable | Default | Purpose |
| ----------------------- | -------------------- | ---------------------------------------------------------------------- |
| `ANTHROPIC_AUTH_TOKEN` | — | Anthropic API (or other proxy) bearer token. Required for Path A. |
| `ANTHROPIC_BASE_URL` | — | Proxy URL, e.g. `https://api.fuelix.ai`. Required for Path A. |
| `ANTHROPIC_API_KEY` | — | Direct Anthropic API key. Required for Path B. |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-5` | Model used for the semantic pass. |
| `PMD_HOME` | `./bin/pmd` | Path to the PMD CLI directory. |

Set **either** Path A (`ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL`) **or**
Path B (`ANTHROPIC_API_KEY`) — not both.
