#!/usr/bin/env node
// Collateral check for the Distribution repository: what it holds must be
// internally consistent before it is published.
//
//   node scripts/check-collateral.mjs [repo-root]     # default: this script's ../
//
//   links      every relative link in every Markdown file resolves to a file or
//              directory in the repository. External links are counted, not
//              fetched: a pull request must not fail because a third-party site
//              is down, and must not make network calls on our behalf.
//   json       every .json file parses.
//   schemas    every schemas/**/*.schema.json compiles (JSON Schema 2020-12,
//              strict) and names the document type it describes in
//              properties.schema.const, uniquely.
//   documents  every .json under compatibility/ names a known type in its
//              `schema` field and validates against that schema. A document
//              whose type has no schema here fails: nothing is published
//              unchecked.
//
// Exit 0 clean, 1 violations, 2 cannot check (e.g. the schema validator is not
// installed: run `npm ci`). The schema validator (ajv) is loaded only when a
// schema or a compatibility document exists.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKIP_DIRS = new Set(['.git', 'node_modules']);

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

export async function checkCollateral(root, { loadAjv = defaultLoadAjv } = {}) {
  const violations = [];
  const errors = [];
  const add = (file, rule, message) => violations.push({ file: path.relative(root, file), rule, message });
  const files = walk(root);
  let external = 0;

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
  const counts = { markdown: files.filter((f) => f.endsWith('.md')).length, external, json: parsed.size, schemas: schemaFiles.length, documents: docFiles.length };
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
  const summary = `${counts.markdown} Markdown file(s), ${counts.external} external link(s) not fetched, ${counts.json} JSON file(s), ${counts.schemas} schema(s), ${counts.documents} compatibility document(s)`;
  if (errors.length) { console.error(`check-collateral: cannot check; ${summary}`); process.exit(2); }
  if (violations.length) { console.error(`check-collateral: ${violations.length} violation(s); ${summary}`); process.exit(1); }
  console.log(`check-collateral: ${summary}; every rule holds`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
