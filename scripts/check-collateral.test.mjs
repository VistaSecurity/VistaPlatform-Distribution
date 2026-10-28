// Tests for check-collateral.mjs. Run after `npm ci`:
//   node --test scripts/check-collateral.test.mjs

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { checkCollateral, markdownLinks } from './check-collateral.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['schema', 'record_id'],
  additionalProperties: false,
  properties: {
    schema: { const: 'example.record/v1' },
    record_id: { type: 'string', minLength: 1 },
  },
};

async function run(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'check-collateral-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      writeFileSync(path.join(root, rel), typeof content === 'string' ? content : JSON.stringify(content));
    }
    const result = await checkCollateral(root);
    return { ...result, rules: result.violations.map((v) => v.rule) };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("this repository's own collateral passes", async () => {
  const { violations, errors } = await checkCollateral(path.join(here, '..'));
  assert.deepEqual(errors, []);
  assert.deepEqual(violations, []);
});

test('links: a relative link that resolves passes, a broken one fails', async () => {
  assert.deepEqual((await run({ 'README.md': '[x](docs/a.md) [y](#top) [z](https://example.com)', 'docs/a.md': '# a' })).rules, []);
  assert.deepEqual((await run({ 'README.md': '[x](docs/missing.md)' })).rules, ['links']);
  assert.deepEqual((await run({ 'README.md': '[x]: ./nowhere.md' })).rules, ['links']);
  assert.deepEqual((await run({ 'README.md': '[x](../outside.md)' })).rules, ['links']);
});

test('links: code is not read as links', () => {
  assert.deepEqual(markdownLinks('`[x](nope)`\n```\n[y](nope)\n```\n[z](yes)'), [{ target: 'yes', lineNo: 5 }]);
});

test('json: a file that does not parse fails', async () => {
  assert.deepEqual((await run({ 'a.json': '{"x": ' })).rules, ['json']);
});

test('documents: valid passes; invalid, untyped and unknown-type fail', async () => {
  const base = { 'schemas/example/v1/record.schema.json': SCHEMA };
  assert.deepEqual((await run({ ...base, 'compatibility/a.json': { schema: 'example.record/v1', record_id: 'r1' } })).rules, []);
  assert.deepEqual((await run({ ...base, 'compatibility/a.json': { schema: 'example.record/v1' } })).rules, ['documents']);
  assert.deepEqual((await run({ ...base, 'compatibility/a.json': { record_id: 'r1' } })).rules, ['documents']);
  assert.deepEqual((await run({ ...base, 'compatibility/a.json': { schema: 'other/v1', record_id: 'r1' } })).rules, ['documents']);
  assert.deepEqual((await run({ 'compatibility/a.json': { schema: 'example.record/v1', record_id: 'r1' } })).rules, ['documents']);
});

test('schemas: a schema without a document type, or a duplicate type, fails', async () => {
  const untyped = { ...SCHEMA, properties: { record_id: { type: 'string' } } };
  assert.deepEqual((await run({ 'schemas/a.schema.json': untyped })).rules, ['schemas']);
  assert.deepEqual((await run({ 'schemas/a.schema.json': SCHEMA, 'schemas/b.schema.json': SCHEMA })).rules, ['schemas']);
  assert.deepEqual((await run({ 'schemas/a.schema.json': { ...SCHEMA, type: 'not-a-type' } })).rules, ['schemas']);
});

test('a missing validator is "cannot check", not a pass', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'check-collateral-'));
  try {
    mkdirSync(path.join(root, 'schemas'));
    writeFileSync(path.join(root, 'schemas', 'a.schema.json'), JSON.stringify(SCHEMA));
    const { errors } = await checkCollateral(root, { loadAjv: async () => { throw new Error('not installed'); } });
    assert.equal(errors.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
