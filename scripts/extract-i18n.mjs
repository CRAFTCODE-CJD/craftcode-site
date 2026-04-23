// CRAFTCODE — MDX to i18n extractor (Read.txt §14).
// Walks src/content/docs/**, harvests human text from prose + named attrs,
// generates stable keys and merges them into i18n/translations/{en,ru}.json.
//
//   npm run i18n:extract          # dry-run, just reports
//   npm run i18n:write             # actually write en.json / ru.json

import { readFile, writeFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMdx from 'remark-mdx';
import { visit, SKIP } from 'unist-util-visit';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CONTENT_ROOT = path.join(ROOT, 'src/content/docs');
const EN_FILE = path.join(ROOT, 'src/i18n/translations/en.json');
const RU_FILE = path.join(ROOT, 'src/i18n/translations/ru.json');

const WRITE = process.argv.includes('--write');

const TRANSLATABLE_ATTRS = new Set(['title', 'tagline', 'kicker', 'caption', 'label', 'alt']);
const PROSE_TAGS = new Set(['Hero', 'Block', 'Step', 'Card', 'Trans']);

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function keyForFile(file) {
  const rel = path.relative(CONTENT_ROOT, file).replace(/\\/g, '/');
  const parts = rel.replace(/\.(md|mdx)$/, '').split('/');
  if (parts[0] === 'plugins' && parts[1]) {
    const slug = parts[1].replace(/[-_](\w)/g, (_, c) => c.toUpperCase());
    const tail = parts.slice(2).filter((p) => p !== 'index').join('.');
    return tail ? `plugin.${slug}.${tail}` : `plugin.${slug}`;
  }
  if (parts[0] === 'about') return 'site.about';
  if (parts[0] === 'templates') return 'site.templates';
  return parts.join('.');
}

function flattenText(node) {
  const out = [];
  visit(node, (n) => {
    if (n.type === 'text') out.push(n.value);
    else if (n.type === 'inlineCode') out.push('`' + n.value + '`');
    else if (n.type === 'code') return SKIP;
  });
  return out.join('').replace(/\s+/g, ' ').trim();
}

function walk(tree, fileKey) {
  const hits = [];
  let section = 'body';
  const counter = {};

  visit(tree, (node) => {
    if (node.type === 'code' || node.type === 'inlineCode') return SKIP;

    if (node.type === 'heading') {
      const txt = flattenText(node);
      section = slugify(txt) || 'body';
      counter[section] = 0;
      hits.push({ key: `${fileKey}.h.${section}`, text: txt, source: 'heading' });
      return;
    }

    if (node.type === 'paragraph') {
      const txt = flattenText(node).trim();
      if (!txt) return;
      counter[section] = (counter[section] ?? 0) + 1;
      const n = counter[section];
      hits.push({ key: `${fileKey}.${section}.p${n}`, text: txt, source: 'paragraph' });
      return;
    }

    if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
      const name = node.name ?? '';
      for (const attr of node.attributes ?? []) {
        if (attr.type !== 'mdxJsxAttribute') continue;
        if (!TRANSLATABLE_ATTRS.has(attr.name)) continue;
        if (typeof attr.value !== 'string') continue;
        const text = attr.value.trim();
        if (!text) continue;
        hits.push({
          key: `${fileKey}.${slugify(name || 'el')}.${attr.name}`,
          text,
          source: `<${name} ${attr.name}>`,
        });
      }
      if (PROSE_TAGS.has(name)) {
        const txt = flattenText(node).trim();
        if (txt) {
          hits.push({
            key: `${fileKey}.${slugify(name)}.body`,
            text: txt,
            source: `<${name}>`,
          });
        }
        return SKIP;
      }
    }
  });

  return hits;
}

async function listMdx() {
  const files = [];
  for await (const f of glob('**/*.{md,mdx}', { cwd: CONTENT_ROOT, withFileTypes: false })) {
    files.push(path.join(CONTENT_ROOT, String(f)));
  }
  return files.sort();
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return {};
  }
}

function stripFrontmatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  return m ? src.slice(m[0].length) : src;
}

async function processFile(file, en, ru) {
  const src = await readFile(file, 'utf8');
  const body = stripFrontmatter(src);
  const tree = unified().use(remarkParse).use(remarkMdx).parse(body);
  const fileKey = keyForFile(file);
  const hits = walk(tree, fileKey);

  for (const h of hits) {
    if (en[h.key] === undefined) en[h.key] = h.text;
    if (ru[h.key] === undefined) ru[h.key] = '';
  }
  return hits;
}

function sortObj(obj) {
  const out = {};
  for (const k of Object.keys(obj).sort()) out[k] = obj[k];
  return out;
}

async function main() {
  const files = await listMdx();
  const en = await readJson(EN_FILE);
  const ru = await readJson(RU_FILE);
  const enBefore = Object.keys(en).length;
  const ruBefore = Object.keys(ru).length;

  console.log(`[i18n] scanning ${files.length} files in ${path.relative(ROOT, CONTENT_ROOT)} …`);

  let total = 0;
  for (const f of files) {
    const hits = await processFile(f, en, ru);
    const rel = path.relative(CONTENT_ROOT, f).replace(/\\/g, '/');
    console.log(`  · ${rel} → ${hits.length}`);
    total += hits.length;
  }

  const enAfter = Object.keys(en).length;
  const ruAfter = Object.keys(ru).length;
  console.log(`[i18n] hits total: ${total}`);
  console.log(`[i18n] en.json: ${enBefore} → ${enAfter} keys`);
  console.log(`[i18n] ru.json: ${ruBefore} → ${ruAfter} keys`);

  if (!WRITE) {
    console.log('[i18n] dry-run (no files written). Run "npm run i18n:write" to persist.');
    return;
  }

  await writeFile(EN_FILE, JSON.stringify(sortObj(en), null, 2) + '\n', 'utf8');
  await writeFile(RU_FILE, JSON.stringify(sortObj(ru), null, 2) + '\n', 'utf8');
  console.log('[i18n] wrote en.json + ru.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
