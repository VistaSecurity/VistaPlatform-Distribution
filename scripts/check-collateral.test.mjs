// Tests for check-collateral.mjs. Run after `npm ci`:
//   node --test scripts/check-collateral.test.mjs

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createHash } from 'node:crypto';

import { checkCollateral, findTerms, fnv32, markdownLinks, normalise, RETIRED_REPOSITORY } from './check-collateral.mjs';

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

// Terms for the hashed rules, made up for these tests: the real ones are not
// spelled in this repository (their mutation tests run in the private tree).
const term = (t, extra = {}) => ({ length: normalise(t).length, sha256: createHash('sha256').update(normalise(t)).digest('hex'), ...extra });
const TEST_TERMS = { labTerms: [term('examplelab'), term('hostx', { token: true })], retiredTerms: [term('formername')] };

async function run(files, opts = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'check-collateral-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      writeFileSync(path.join(root, rel), typeof content === 'string' ? content : JSON.stringify(content));
    }
    const result = await checkCollateral(root, { ...TEST_TERMS, ...opts });
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

test('retired-repo: any mention of the former source repository fails', async () => {
  assert.deepEqual((await run({ 'README.md': `see https://github.com/VistaSecurity/${RETIRED_REPOSITORY}/releases` })).rules, ['retired-repo']);
  assert.deepEqual((await run({ 'deploy/x.yaml': `# ${RETIRED_REPOSITORY.toLowerCase()} mirror\na: 1\n` })).rules, ['retired-repo']);
  assert.deepEqual((await run({ 'README.md': 'see https://github.com/VistaSecurity/VistaPlatform-Agents' })).rules, []);
});

test('agent-mtls: turning agent mTLS or the mesh off fails, in text and in values', async () => {
  const off = ['agentMtls', 'enabled=false'].join('.');
  assert.deepEqual((await run({ 'INSTALL.md': `helm install x --set ${off}` })).rules, ['agent-mtls']);
  assert.deepEqual((await run({ 'v.yaml': 'serviceMtls:\n  enabled: false\n' })).rules, ['agent-mtls']);
  assert.deepEqual((await run({ 'v.yaml': 'agentMtls:\n  enabled: true\n' })).rules, []);
});

test('latest: a moving image tag, releases/latest, or an untagged compose image fails', async () => {
  assert.deepEqual((await run({ 'README.md': 'docker pull ghcr.io/vistasecurity/auth-service:' + 'latest' })).rules, ['latest']);
  assert.deepEqual((await run({ 'README.md': 'https://github.com/x/y/releases/' + 'latest' })).rules, ['latest']);
  assert.deepEqual((await run({ 'compose.yaml': 'services:\n  a:\n    image: ghcr.io/vistasecurity/a\n' })).rules, ['latest']);
  assert.deepEqual((await run({ 'compose.yaml': `services:\n  a:\n    image: ghcr.io/vistasecurity/a:v1.2.3@sha256:${'a'.repeat(64)}\n` })).rules, []);
  assert.deepEqual((await run({ 'feature-status.md': 'features/latest.json is a file name, not a tag' })).rules, []);
});

test('compose: a build key, a bind mount or a service without an image fails', async () => {
  assert.deepEqual((await run({ 'compose.yaml': 'services:\n  a:\n    image: x/a:v1\n    build: .\n' })).rules, ['compose']);
  assert.deepEqual((await run({ 'compose.yaml': 'services:\n  a:\n    image: x/a:v1\n    volumes:\n      - ./src:/app\n' })).rules, ['compose']);
  assert.deepEqual((await run({ 'compose.yaml': 'services:\n  a:\n    image: x/a:v1\n    volumes:\n      - type: bind\n        source: /etc\n        target: /x\n' })).rules, ['compose']);
  assert.deepEqual((await run({ 'compose.yaml': 'services:\n  a:\n    environment:\n      A: b\n' })).rules, ['compose']);
  assert.deepEqual((await run({ 'compose.yaml': 'services:\n  a:\n    image: x/a:v1\n    volumes:\n      - data:/var/lib/x\n' })).rules, []);
});

test('lab-identity: a private address or a listed term fails, in any spelling', async () => {
  assert.deepEqual((await run({ 'README.md': 'reach it at 192' + '.168.4.7' })).rules, ['lab-identity']);
  assert.deepEqual((await run({ 'README.md': 'or 10' + '.0.0.12, or 172' + '.20.1.1' })).rules, ['lab-identity']);
  assert.deepEqual((await run({ 'README.md': 'the Example-Lab registry' })).rules, ['lab-identity']);
  assert.deepEqual((await run({ 'README.md': 'pull from registry.example.lab.net' })).rules, ['lab-identity']);
  assert.deepEqual((await run({ 'x.json': JSON.stringify({ host: 'hostx.internal' }) })).rules, ['lab-identity']);
  assert.deepEqual((await run({ 'examplelab-notes.md': '# notes' })).rules, ['lab-identity'], 'a term in a file name is caught');
  // A short (token) term matches whole words only: no false alarm across a word boundary.
  assert.deepEqual((await run({ 'README.md': 'host xylophone, ghostx' })).rules, []);
  assert.deepEqual((await run({ 'README.md': 'public 8.8.8.8 and 172.15.0.1' })).rules, []);
});

test('retired-name: a retired name fails, spaced, hyphenated or in capitals', async () => {
  for (const s of ['FormerName', 'former-name', 'former name', 'FORMER.NAME']) {
    assert.deepEqual((await run({ 'README.md': `once called ${s}` })).rules, ['retired-name'], s);
  }
});

test('findTerms is exact: it reports only the terms present', () => {
  const t = [term('alpha'), term('beta', { token: true })];
  assert.deepEqual(findTerms('ALPHA and gamma', t), [0]);
  assert.deepEqual(findTerms('a beta here', t), [1]);
  assert.deepEqual(findTerms('alphabet', t), [0]);
  assert.deepEqual(findTerms('alphabetical', [term('beta', { token: true })]), []);
  // With the FNV prefilter set, the result is the same; with a wrong one, the term is never confirmed.
  assert.deepEqual(findTerms('ALPHA', [term('alpha', { fnv: fnv32('alpha') })]), [0]);
  assert.deepEqual(findTerms('ALPHA', [term('alpha', { fnv: fnv32('alphx') })]), []);
});

test('the real term lists are non-empty and well formed', async () => {
  const { LAB_TERMS, RETIRED_TERMS } = await import('./check-collateral.mjs');
  for (const t of [...LAB_TERMS, ...RETIRED_TERMS]) {
    assert.match(t.sha256, /^[0-9a-f]{64}$/);
    assert.equal(typeof t.fnv, 'number');
  }
  assert.ok(LAB_TERMS.length >= 10 && RETIRED_TERMS.length === 2);
});
