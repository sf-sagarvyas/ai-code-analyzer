// One-shot diagnostic: does the configured endpoint support tool_use?
// Reads .env.local manually so we don't add a runtime dep.
import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';

const envText = readFileSync('.env.local', 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? 'unused',
  authToken: process.env.ANTHROPIC_AUTH_TOKEN,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});

const model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5';

console.log(`Endpoint: ${process.env.ANTHROPIC_BASE_URL ?? 'default'}`);
console.log(`Model: ${model}`);
console.log('');

async function test(label, body) {
  console.log(`--- TEST: ${label} ---`);
  try {
    const t0 = Date.now();
    const r = await client.messages.create(body);
    console.log(` duration: ${Date.now() - t0}ms`);
    console.log(` stop_reason: ${r.stop_reason}`);
    console.log(` content block types: ${r.content.map((b) => b.type).join(', ')}`);
    if (r.content[0]?.type === 'text') {
      console.log(` text (first 200 chars): ${r.content[0].text.slice(0, 200)}`);
    }
    if (r.content.find((b) => b.type === 'tool_use')) {
      const tu = r.content.find((b) => b.type === 'tool_use');
      console.log(` tool_use input keys: ${Object.keys(tu.input ?? {}).join(', ')}`);
      console.log(` tool_use input: ${JSON.stringify(tu.input).slice(0, 300)}`);
    }
    const usage = r.usage;
    console.log(` usage: ${JSON.stringify(usage)}`);
  } catch (e) {
    console.log(` ERROR: ${e.message}`);
    if (e.status) console.log(` HTTP status: ${e.status}`);
    if (e.error) console.log(` body: ${JSON.stringify(e.error).slice(0, 500)}`);
  }
  console.log('');
}

await test('1. Plain text', {
  model,
  max_tokens: 256,
  messages: [{ role: 'user', content: 'Say hello in 3 words.' }],
});

await test('2. With tools + tool_choice', {
  model,
  max_tokens: 512,
  tools: [
    {
      name: 'report',
      description: 'Report findings.',
      input_schema: {
        type: 'object',
        properties: { findings: { type: 'array', items: { type: 'string' } } },
        required: ['findings'],
      },
    },
  ],
  tool_choice: { type: 'tool', name: 'report' },
  messages: [{ role: 'user', content: 'Call report with findings ["alpha", "beta"].' }],
});

await test('3. With cache_control on system', {
  model,
  max_tokens: 256,
  system: [
    { type: 'text', text: 'You are a helpful assistant. ' + 'Lorem ipsum '.repeat(200), cache_control: { type: 'ephemeral' } },
  ],
  messages: [{ role: 'user', content: 'Say "ok".' }],
});
