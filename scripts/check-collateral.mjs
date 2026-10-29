#!/usr/bin/env node
// Collateral check for the Distribution repository: what it holds must be
// internally consistent, and true of the product, before it is published.
//
//   node scripts/check-collateral.mjs [repo-root]     # default: this script's ../
//
//   links         every relative link in every Markdown file resolves to a file
//                 or directory in the repository. External links are counted,
//                 not fetched: a pull request must not fail because a
//                 third-party site is down, and must not make network calls on
//                 our behalf.
//   json          every .json file parses.
//   schemas       every schemas/**/*.schema.json compiles (JSON Schema 2020-12,
//                 strict) and names the document type it describes in
//                 properties.schema.const, uniquely.
//   documents     every .json under compatibility/ names a known type in its
//                 `schema` field and validates against that schema. A document
//                 whose type has no schema here fails: nothing is published
//                 unchecked.
//   retired-repo  no file names the former public source repository of the
//                 platform (RETIRED_REPOSITORY). It is private: every link into
//                 it is dead, and nothing here may send a reader there.
//   agent-mtls    nothing turns agent mTLS or the service mesh off: neither
//                 `agentMtls.enabled` nor `serviceMtls.enabled` set to false,
//                 on a command line or in a YAML values file. The chart
//                 refuses both; a text that offers them is wrong.
//   latest        no moving pointer: no image reference with the `latest` tag,
//                 no `releases/latest` URL, no image in a compose file without
//                 an explicit tag or digest. Every reference names one version.
//   compose       every YAML file with a top-level `services:` mapping (a
//                 compose file) pulls images only: no `build:` key, no bind
//                 mount of a host path (a source checkout), and every service
//                 names an `image:`.
//   lab-identity  no private network address (RFC 1918) and none of the
//                 internal host, network, registry, account or path names of
//                 the private build environment (LAB_TERMS, stored as SHA-256
//                 digests so this public file does not spell them).
//   retired-name  neither of the two retired names (RETIRED_TERMS, the same
//                 way), in any spelling with spaces, hyphens or dots between
//                 the parts.
//
// Exit 0 clean, 1 violations, 2 cannot check (e.g. the schema validator is not
// installed: run `npm ci`). The schema validator (ajv) is loaded only when a
// schema or a compatibility document exists.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseYaml } from './check-workflows.mjs';

const SKIP_DIRS = new Set(['.git', 'node_modules', '.scratch']);

// The former public source repository of the platform, private since the
// clean cut (NOTICE-2026-10.md). Assembled so this file does not name it.
export const RETIRED_REPOSITORY = ['VistaPlatform', 'Core'].join('-');

// Terms are compared after normalisation (lower case, every character that is
// not a letter or digit removed), so `a.b`, `a-b` and `a b` all match `ab`.
// `token` terms are short and would match across word boundaries ("for case"
// contains a four-letter host name once spaces go), so they are compared
// against whole words only. Digests are SHA-256 of the normalised term.
// Hashing keeps the names out of this file's text; it is not secrecy (a short
// word can be recovered by brute force), which is not the point: the point is
// that a published file never spells them, and that a planted one is caught.
// `fnv` (FNV-1a, 32 bit, of the same normalised term) is a prefilter: the
// SHA-256 is computed only for a window whose FNV matches, which keeps a scan
// of the whole repository fast. A term without it is checked by SHA-256 alone.
export const LAB_TERMS = [
  { length: 6, fnv: 0xd832eb2b, sha256: 'c61ea2e4090f48c9ec54ef84d4686f9657d26f03451b74ff8e50665d9c37337d' },
  { length: 5, fnv: 0xa67786f2, sha256: 'ee78a5897ca038b04bc43bebe5507ea55d5f7e0b9ad3619e5ffdbe6437f4b02c', token: true },
  { length: 7, fnv: 0xb87c9e2f, sha256: '2589657757d60bee4dc259e89fbf80acfdd8bdeae52b374281e0869d07ac63dc' },
  { length: 4, fnv: 0xd32b768c, sha256: 'e0c924608fdcda8536bd9cc86b0fce0ab2d54ecc1e8ed9673624c39cde7f7820', token: true },
  { length: 4, fnv: 0x542be564, sha256: '0787b3121efcdb4f4e2aa2271a88212bdfc9790f4cd2bf19f64bf37600113ffb', token: true },
  { length: 4, fnv: 0x572bea1d, sha256: 'e5f7d3902f898dc57548e0e7b026b6a555a6b33aa8a7f8b8d75cfed3eab73a15', token: true },
  { length: 6, fnv: 0x2bab924c, sha256: '7bcaabf057edf185b425d496b7958bdc7708d7eb3cc033e2824e8edb078eb6d3' },
  { length: 6, fnv: 0x502955cb, sha256: 'c1d64b2d4cb30f1be788cc4d246ddd9fc1fe85a3eb3a85a3de33829dfaf6ce7d' },
  { length: 10, fnv: 0xe596afca, sha256: '382b54cd874f9a17ec04de80193aae6409d53c88d980412c9fd109587b5f22bc' },
  { length: 12, fnv: 0x1306f786, sha256: '77cf56085a016cf2ce1969d324c286d6d3828f4e057ccd4307dff279c04138c4' },
  { length: 9, fnv: 0x0b38e432, sha256: 'dd92b2fc7f6bb2e91c5cfdfcf54716e1f6b8949fa036062c0778e2beeecc8e43' },
  { length: 9, fnv: 0x41ccd49c, sha256: 'de19fb7ee304442e0c968b80b3e2b487e4cc74143e8333395e43a17ba7bedcfb' },
  { length: 16, fnv: 0xc8764f2f, sha256: '0e7e70506ff2e7c6da9974d6cf6e9cbff82c39b0c647e796a35594a95d933156' },
];
export const RETIRED_TERMS = [
  { length: 10, fnv: 0x5009c272, sha256: '0e7c9cffbb891a6cbcad56c71f6314a292169dd8846d940dd8038cbd09466f36' },
  { length: 8, fnv: 0x233c6884, sha256: '19a6a8bbbf28cf02a2290925bc715c02d5c953c8873a0fb46ea3eb53456a01e4' },
];

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
export const normalise = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

export function fnv32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// Which of `terms` occur in `text`; returns the indexes of the terms found.
// Every distinct window of a term's length over the normalised text is a
// candidate; token terms are compared against whole words only.
export function findTerms(text, terms) {
  const found = new Set();
  const flat = normalise(text);
  const words = new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const matches = (w, t) => (t.fnv === undefined || fnv32(w) === t.fnv) && sha256(w) === t.sha256;
  const byLength = new Map();
  terms.forEach((t, i) => {
    if (t.token) {
      for (const w of words) if (w.length === t.length && matches(w, t)) found.add(i);
      return;
    }
    if (!byLength.has(t.length)) byLength.set(t.length, []);
    byLength.get(t.length).push(i);
  });
  for (const [len, idx] of byLength) {
    const windows = new Set();
    for (let p = 0; p + len <= flat.length; p++) windows.add(flat.slice(p, p + len));
    for (const w of windows) for (const i of idx) if (!found.has(i) && matches(w, terms[i])) found.add(i);
  }
  return [...found].sort((a, b) => a - b);
}

// The three RFC 1918 blocks (/8, /12 and /16).
export const RFC1918 = /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    if (SKIP_DIRS.has(name)) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// Link targets in Markdown outside fenced code blocks and code spans.
export function markdownLinks(text) {
  const out = [];
  let fence = null;
  text.split('\n').forEach((line, i) => {
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      return;
    }
    if (fence) return;
    const bare = line.replace(/`[^`]*`/g, '');
    for (const m of bare.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) out.push({ target: m[1], lineNo: i + 1 });
    const ref = /^\s{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s|$)/.exec(bare);
    if (ref) out.push({ target: ref[1], lineNo: i + 1 });
  });
  return out;
}

export function isExternal(target) {
  return /^[a-z][a-z0-9+.-]*:/i.test(target);
}

// Line-level rules over any text file. Returns [{rule, lineNo, message}].
export function textViolations(text) {
  const out = [];
  text.split('\n').forEach((line, i) => {
    const lineNo = i + 1;
    if (line.toLowerCase().includes(RETIRED_REPOSITORY.toLowerCase())) {
      out.push({ rule: 'retired-repo', lineNo, message: `names the former public source repository (${RETIRED_REPOSITORY}), which is private` });
    }
    if (/\b(agentMtls|serviceMtls)\.enabled\s*[=:]\s*["']?false\b/i.test(line)) {
      out.push({ rule: 'agent-mtls', lineNo, message: 'turns agent mTLS or the service mesh off; the chart refuses it' });
    }
    if (/[a-z0-9][\w./-]*:latest\b/i.test(line)) out.push({ rule: 'latest', lineNo, message: 'names an image by the moving `latest` tag' });
    if (/\/releases\/latest\b/i.test(line)) out.push({ rule: 'latest', lineNo, message: 'links a moving `releases/latest` URL' });
    if (RFC1918.test(line)) out.push({ rule: 'lab-identity', lineNo, message: 'names a private (RFC 1918) network address' });
  });
  return out;
}

const isMapping = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Rules over a parsed YAML document: values files and compose files.
export function yamlViolations(doc) {
  const out = [];
  if (!isMapping(doc)) return out;
  for (const block of ['agentMtls', 'serviceMtls']) {
    if (isMapping(doc[block]) && (doc[block].enabled === false || doc[block].enabled === 'false')) {
      out.push({ rule: 'agent-mtls', message: `${block}.enabled is false; the chart refuses it` });
    }
  }
  if (isMapping(doc.services)) {
    for (const [name, svc] of Object.entries(doc.services)) {
      if (!isMapping(svc)) continue;
      if ('build' in svc) out.push({ rule: 'compose', message: `service ${name} has a build: key; Distribution compose files pull images only` });
      const image = typeof svc.image === 'string' ? svc.image : '';
      if (!image) out.push({ rule: 'compose', message: `service ${name} names no image` });
      else if (!/@sha256:[0-9a-f]{64}$/.test(image) && !/:[^/:]+$/.test(image)) {
        out.push({ rule: 'latest', message: `service ${name} image ${image} has no tag or digest (Docker reads that as latest)` });
      }
      for (const v of [].concat(svc.volumes || [])) {
        const source = typeof v === 'string' ? v.split(':')[0] : isMapping(v) ? (v.type === 'bind' ? String(v.source || '') : '') : '';
        const bind = isMapping(v) ? v.type === 'bind' : /^(\.|\/|~|\$)/.test(source);
        if (bind) out.push({ rule: 'compose', message: `service ${name} bind-mounts the host path ${source || '(unnamed)'}; only named volumes and configs` });
      }
    }
  }
  return out;
}

export async function checkCollateral(root, { loadAjv = defaultLoadAjv, labTerms = LAB_TERMS, retiredTerms = RETIRED_TERMS } = {}) {
  const violations = [];
  const errors = [];
  const add = (file, rule, message) => violations.push({ file: path.relative(root, file), rule, message });
  const files = walk(root);
  let external = 0;

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const rel = path.relative(root, file);
    for (const v of textViolations(text)) add(file, v.rule, `line ${v.lineNo}: ${v.message}`);
    for (const i of findTerms(`${rel}\n${text}`, labTerms)) add(file, 'lab-identity', `names a host, network, registry, account or path of the private build environment (term ${i})`);
    for (const i of findTerms(`${rel}\n${text}`, retiredTerms)) add(file, 'retired-name', `names a retired name (term ${i})`);
    if (/\.ya?ml$/.test(file)) {
      let doc;
      try {
        doc = parseYaml(text);
      } catch (e) {
        errors.push({ file: rel, message: `cannot parse YAML: ${e.message}` });
        continue;
      }
      for (const v of yamlViolations(doc)) add(file, v.rule, v.message);
    }
  }

  for (const file of files.filter((f) => f.endsWith('.md'))) {
    for (const { target, lineNo } of markdownLinks(readFileSync(file, 'utf8'))) {
      if (isExternal(target)) { external++; continue; }
      if (target.startsWith('#')) continue;
      const clean = decodeURIComponent(target.replace(/[#?].*$/, ''));
      const resolved = clean.startsWith('/') ? path.join(root, clean) : path.resolve(path.dirname(file), clean);
      const rel = path.relative(root, resolved);
      if (rel.startsWith('..') || path.isAbsolute(rel) || !existsSync(resolved)) add(file, 'links', `line ${lineNo}: "${target}" does not resolve inside the repository`);
    }
  }

  const parsed = new Map();
  for (const file of files.filter((f) => f.endsWith('.json'))) {
    try {
      parsed.set(file, JSON.parse(readFileSync(file, 'utf8')));
    } catch (e) {
      add(file, 'json', `does not parse: ${e.message}`);
    }
  }

  const schemaFiles = [...parsed.keys()].filter((f) => f.startsWith(path.join(root, 'schemas') + path.sep) && f.endsWith('.schema.json'));
  const docFiles = [...parsed.keys()].filter((f) => f.startsWith(path.join(root, 'compatibility') + path.sep));
  const counts = { files: files.length, markdown: files.filter((f) => f.endsWith('.md')).length, external, json: parsed.size, schemas: schemaFiles.length, documents: docFiles.length };
  if (schemaFiles.length === 0 && docFiles.length === 0) return { violations, errors, counts };

  let ajv;
  try {
    ajv = await loadAjv();
  } catch (e) {
    errors.push({ file: '.', message: `cannot load the schema validator (run npm ci): ${e.message}` });
    return { violations, errors, counts };
  }

  const byType = new Map();
  for (const file of schemaFiles) {
    const schema = parsed.get(file);
    let validate;
    try {
      validate = ajv.compile(schema);
    } catch (e) {
      add(file, 'schemas', `does not compile: ${e.message}`);
      continue;
    }
    const type = schema && schema.properties && schema.properties.schema && schema.properties.schema.const;
    if (typeof type !== 'string') { add(file, 'schemas', 'names no document type (properties.schema.const)'); continue; }
    if (byType.has(type)) { add(file, 'schemas', `document type ${type} is also described by ${path.relative(root, byType.get(type).file)}`); continue; }
    byType.set(type, { file, validate });
  }

  for (const file of docFiles) {
    const doc = parsed.get(file);
    const type = doc && typeof doc === 'object' ? doc.schema : undefined;
    const entry = typeof type === 'string' ? byType.get(type) : undefined;
    if (!entry) { add(file, 'documents', `document type ${JSON.stringify(type)} has no schema under schemas/`); continue; }
    if (!entry.validate(doc)) {
      for (const err of entry.validate.errors) add(file, 'documents', `${err.instancePath || '/'} ${err.message}`);
    }
  }
  return { violations, errors, counts };
}

async function defaultLoadAjv() {
  const { default: Ajv2020 } = await import('ajv/dist/2020.js');
  const { default: addFormats } = await import('ajv-formats');
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  return ajv;
}

async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(process.argv[2] || path.join(here, '..'));
  const { violations, errors, counts } = await checkCollateral(root);
  for (const e of errors) console.error(`::error file=${e.file}::cannot check: ${e.message}`);
  for (const v of violations) console.error(`::error file=${v.file}::[${v.rule}] ${v.message}`);
  const summary = `${counts.files} file(s), ${counts.markdown} Markdown, ${counts.external} external link(s) not fetched, ${counts.json} JSON file(s), ${counts.schemas} schema(s), ${counts.documents} compatibility document(s)`;
  if (errors.length) { console.error(`check-collateral: cannot check; ${summary}`); process.exit(2); }
  if (violations.length) { console.error(`check-collateral: ${violations.length} violation(s); ${summary}`); process.exit(1); }
  console.log(`check-collateral: ${summary}; every rule holds`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
