// CRAFTCODE — MDX i18n extractor + in-place rewriter (Read.txt §14).
//
//   npm run i18n:extract   — dry-run: parse + report, no file changes
//   npm run i18n:write     — write en.json / ru.json AND rewrite MDX sources
//                            to wrap prose in <Trans id="…"> components.
//
// Rewrite strategy (source-level surgical splice — preserves formatting):
//   · Heading `## Text`  → `## <Trans id="KEY">Text</Trans>`
//       Keeps markdown heading prefix so MDX still parses it as a heading.
//   · Paragraph of plain prose → wrap the whole node in <Trans>…</Trans>.
//   · Paragraph that contains a table (multi-line with pipes) → skip.
//       Table markdown inside a JSX element is not parsed by MDX.
//   · Paragraphs inside JSX blocks (Block/Card/Step) → wrap normally.
//   · Already-wrapped nodes → skip (idempotent).
//
// Frontmatter (`title`, `description`, `tagline`, `kicker`) is mirrored into
// `plugin.<slug>.<field>` / `site.<name>.<field>` keys.

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
const PROSE_TAGS = new Set(['Hero', 'Block', 'Step', 'Card']);

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function fileKeyFor(file) {
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

function frontmatterBaseFor(file) {
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

/** Like flattenText, but preserves inline markdown (bold/italic/code/links)
 *  and raw HTML elements (<kbd>, <br>) so the string can be fed into
 *  apply(innerHTML=…) after mini-md-to-html conversion. */
function flattenMarkdown(node) {
  function render(n) {
    if (!n) return '';
    switch (n.type) {
      case 'text':
        return n.value;
      case 'inlineCode':
        return '`' + n.value + '`';
      case 'strong':
        return '**' + (n.children ?? []).map(render).join('') + '**';
      case 'emphasis':
        return '*' + (n.children ?? []).map(render).join('') + '*';
      case 'delete':
        return '~~' + (n.children ?? []).map(render).join('') + '~~';
      case 'link': {
        const inner = (n.children ?? []).map(render).join('');
        return '[' + inner + '](' + (n.url ?? '') + ')';
      }
      case 'break':
        return '\n';
      case 'code':
        return '';
      case 'mdxJsxTextElement':
      case 'mdxJsxFlowElement': {
        const name = n.name ?? '';
        // Lowercase JSX names are treated as raw HTML (<kbd>, <br>, …).
        // Preserve them verbatim so apply() can dump into innerHTML.
        if (/^[a-z]/.test(name)) {
          const attrs = (n.attributes ?? [])
            .filter((a) => a.type === 'mdxJsxAttribute' && typeof a.value === 'string')
            .map((a) => ` ${a.name}="${a.value.replace(/"/g, '&quot;')}"`)
            .join('');
          const inner = (n.children ?? []).map(render).join('');
          if (!inner && /^(br|hr|img)$/i.test(name)) return `<${name}${attrs}/>`;
          return `<${name}${attrs}>${inner}</${name}>`;
        }
        // Component JSX (Trans, Hero, Block …) — unwrap children.
        return (n.children ?? []).map(render).join('');
      }
      default:
        return (n.children ?? []).map(render).join('');
    }
  }
  return render(node).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/** True if a node tree already contains a <Trans> JSX element — skip wrap. */
function containsTrans(node) {
  let found = false;
  visit(node, (n) => {
    if ((n.type === 'mdxJsxFlowElement' || n.type === 'mdxJsxTextElement') && n.name === 'Trans') {
      found = true;
      return false;
    }
  });
  return found;
}

/** Parse the leading YAML frontmatter for string scalars we care about. */
function parseFrontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, bodyStart: 0 };
  const yaml = m[1];
  const data = {};
  for (const line of yaml.split(/\r?\n/)) {
    const mm = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!mm) continue;
    let v = mm[2].trim();
    if (!v) continue;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    data[mm[1]] = v;
  }
  return { data, bodyStart: m[0].length };
}

/** Heuristic: a "table paragraph" is a paragraph whose source contains '\n|'
 *  — i.e. multiple piped lines. Markdown tables in remark without GFM get
 *  collapsed into a single paragraph node. Don't wrap these. */
function looksLikeTable(src, node) {
  if (!node.position) return false;
  const s = src.slice(node.position.start.offset, node.position.end.offset);
  return /\n\s*\|/.test(s) || s.startsWith('|');
}

function collectHits(body, tree, fileKey) {
  const hits = [];
  let section = 'body';
  const counter = {};
  const liCounter = {}; // separate namespace for list items (".li1", ".li2" …)
  const wraps = []; // { kind: 'heading'|'paragraph'|'listitem', node, key }

  function paragraphKey() {
    counter[section] = (counter[section] ?? 0) + 1;
    return `${fileKey}.${section}.p${counter[section]}`;
  }

  function listItemKey(ns) {
    liCounter[ns] = (liCounter[ns] ?? 0) + 1;
    return `${fileKey}.${ns}.li${liCounter[ns]}`;
  }

  // Process a list node: wrap the first paragraph of each listItem.
  // `ns` is the section namespace to attach keys under (uses ".liN" suffix
  // so it never collides with paragraph ".pN" keys in the same section).
  function processList(listNode, ns) {
    for (const item of listNode.children ?? []) {
      if (item.type !== 'listItem') continue;
      const para = (item.children ?? []).find((c) => c.type === 'paragraph');
      if (!para) continue;
      if (containsTrans(para)) continue; // idempotent — already wrapped
      if (looksLikeTable(body, para)) continue;
      const txt = flattenMarkdown(para).trim();
      if (!txt) continue;
      const key = listItemKey(ns);
      hits.push({ key, text: txt, source: 'listitem' });
      wraps.push({ kind: 'listitem', node: para, key });
      // Nested lists — recurse using same namespace.
      for (const c of item.children) {
        if (c.type === 'list') processList(c, ns);
      }
    }
  }

  for (const node of tree.children ?? []) {
    if (node.type === 'heading') {
      const txt = flattenText(node);
      if (!txt) continue;
      section = slugify(txt) || 'body';
      counter[section] = 0;
      const key = `${fileKey}.h.${section}`;
      hits.push({ key, text: txt, source: 'heading' });
      if (!containsTrans(node)) wraps.push({ kind: 'heading', node, key });
      continue;
    }

    if (node.type === 'paragraph') {
      const txt = flattenMarkdown(node).trim();
      if (!txt) continue;
      const key = paragraphKey();
      hits.push({ key, text: txt, source: 'paragraph' });
      if (!containsTrans(node) && !looksLikeTable(body, node)) {
        wraps.push({ kind: 'paragraph', node, key });
      }
      continue;
    }

    if (node.type === 'list') {
      processList(node, section);
      continue;
    }

    if (node.type === 'mdxJsxFlowElement') {
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

      const isHtmlWrapper = /^[a-z]/.test(name); // <details>, <summary>, …
      if (PROSE_TAGS.has(name)) {
        // Existing behavior: wrap paragraphs nested inside the component.
        let pIdx = 0;
        visit(node, (n) => {
          if (n === node) return;
          if (n.type === 'list') return SKIP; // list items handled separately
          if (n.type === 'paragraph') {
            pIdx += 1;
            const txt = flattenMarkdown(n).trim();
            if (!txt) return;
            const key = `${fileKey}.${slugify(name)}.p${pIdx}`;
            hits.push({ key, text: txt, source: `<${name}> p${pIdx}` });
            if (!containsTrans(n) && !looksLikeTable(body, n)) {
              wraps.push({ kind: 'paragraph', node: n, key });
            }
          }
        });
        // Lists inside the prose container — wrap their items with ".liN" keys
        // in the component's own namespace.
        const compNs = slugify(name);
        visit(node, (n) => {
          if (n.type === 'list') {
            processList(n, compNs);
            return SKIP; // avoid double-processing nested lists
          }
        });
      } else if (isHtmlWrapper) {
        // HTML wrappers like <details>: wrap direct lists in current section.
        visit(node, (n) => {
          if (n.type === 'list') {
            processList(n, section);
            return SKIP;
          }
        });
      }
    }
  }

  return { hits, wraps };
}

/** Splice wrappers into source right-to-left to preserve offsets. */
function applyWraps(src, wraps) {
  const valid = wraps
    .filter((w) => w.node.position && typeof w.node.position.start.offset === 'number')
    .sort((a, b) => b.node.position.start.offset - a.node.position.start.offset);
  let out = src;
  let count = 0;
  for (const w of valid) {
    const s = w.node.position.start.offset;
    const e = w.node.position.end.offset;
    const slice = out.slice(s, e);
    if (/<Trans\b/.test(slice)) continue; // already wrapped

    let replaced;
    if (w.kind === 'heading') {
      // Match optional `#+ ` prefix and wrap only the text after it.
      const m = slice.match(/^(\s*#+\s+)([\s\S]*)$/);
      if (!m) continue;
      replaced = `${m[1]}<Trans id="${w.key}">${m[2]}</Trans>`;
    } else {
      // Paragraph — wrap the whole slice. MDX will parse inline markdown
      // (bold, code, links) inside <Trans> since it's a text-element.
      replaced = `<Trans id="${w.key}">${slice}</Trans>`;
    }
    out = out.slice(0, s) + replaced + out.slice(e);
    count++;
  }
  return { out, count };
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

function sortObj(obj) {
  const out = {};
  for (const k of Object.keys(obj).sort()) out[k] = obj[k];
  return out;
}

// Minimal EN translations for frontmatter fields. Plugin names stay EN.
const FRONTMATTER_EN = {
  'plugin.spriteOptimizer.title': 'Sprite Optimizer',
  'plugin.spriteOptimizer.description': 'Professional sprite packing & optimization plugin for Unreal Engine 4.27–5.7.',
  'plugin.spriteOptimizer.tagline': 'Atlas packing, alpha trimming, auto-generated Material Instances, and reverse-engineering existing atlases — one editor for the entire 2D pipeline in Unreal.',
  'plugin.spriteOptimizer.kicker': '// plugin · paper2d',

  'plugin.manualsprite.title': 'ManualSprite Editor Tools',
  'plugin.manualsprite.description': 'Manual 2D geometry editor for PaperSprite — build pixel-perfect collisions and generate StaticMesh / SkeletalMesh straight from 2D art.',
  'plugin.manualsprite.tagline': 'Fills the gap in stock Paper2D: place vertices by hand, assemble triangles, generate StaticMesh and SkeletalMesh directly from 2D art — with materials, skeleton, and pivot control.',
  'plugin.manualsprite.kicker': '// plugin · paper2d · geometry',

  'plugin.mouseinterceptor.title': 'Mouse Interceptor',
  'plugin.mouseinterceptor.description': 'Global mouse event interception for Unreal Engine — no ticks, Blueprint delegates, configurable double-click.',
  'plugin.mouseinterceptor.tagline': 'Lightweight Unreal Engine plugin for global mouse interception. OnMousePressed / OnMouseReleased delegates, configurable double-click threshold, no ticks.',
  'plugin.mouseinterceptor.kicker': '// plugin · input · runtime',

  'plugin.spriteOptimizer.getting-started.title': 'Getting started',
  'plugin.spriteOptimizer.getting-started.description': 'First steps with Sprite Optimizer — installation and your first atlas.',
  'plugin.spriteOptimizer.reference.title': 'Reference',
  'plugin.spriteOptimizer.reference.description': 'Hotkeys, project settings, and technical details for Sprite Optimizer.',
  'plugin.spriteOptimizer.features.atlas.title': 'Atlas Mode',
  'plugin.spriteOptimizer.features.atlas.description': 'Pack textures into atlas sheets with an interactive editor.',
  'plugin.spriteOptimizer.features.optimize.title': 'Optimize Mode',
  'plugin.spriteOptimizer.features.optimize.description': 'Trim transparent edges while preserving sprite pivot.',
  'plugin.spriteOptimizer.features.import-atlas.title': 'Import Atlas',
  'plugin.spriteOptimizer.features.import-atlas.description': 'Reverse-engineer an existing atlas back into editable elements.',
  'plugin.spriteOptimizer.features.project-asset.title': 'Sprite Optimizer Project',
  'plugin.spriteOptimizer.features.project-asset.description': 'Resumable editing sessions — save an atlas and come back to it later.',

  'plugin.manualsprite.getting-started.title': 'How to use',
  'plugin.manualsprite.getting-started.description': 'Step-by-step guide for Manual Sprite Editor Tools — from install to mesh generation.',
  'plugin.manualsprite.reference.title': 'Reference',
  'plugin.manualsprite.reference.description': 'Toolbar, hotkeys, Project Settings, and technical details for ManualSprite Editor Tools.',

  'plugin.mouseinterceptor.getting-started.title': 'How to use',
  'plugin.mouseinterceptor.getting-started.description': 'Add MouseInterceptorComponent, subscribe to mouse delegates in Blueprint, tune the double-click threshold.',
  'plugin.mouseinterceptor.reference.title': 'Reference',
  'plugin.mouseinterceptor.reference.description': 'API, delegates, and FAQ for Mouse Interceptor.',

  'site.about.title': 'About',
  'site.about.description': 'CRAFTCODE — who is behind the tools, how to reach out, and where to track updates.',
  'site.templates.title': 'Templates',
  'site.templates.description': 'Project and game templates for Unreal Engine — coming soon.',
};

async function processFile(file, en, ru) {
  const src = await readFile(file, 'utf8');
  const fm = parseFrontmatter(src);
  const body = src.slice(fm.bodyStart);

  // Frontmatter mirror into i18n JSON
  const frontBase = frontmatterBaseFor(file);
  for (const field of ['title', 'description', 'tagline', 'kicker']) {
    if (!fm.data[field]) continue;
    const k = `${frontBase}.${field}`;
    if (ru[k] === undefined) ru[k] = fm.data[field];
    if (en[k] === undefined) en[k] = FRONTMATTER_EN[k] ?? '';
  }

  const tree = unified().use(remarkParse).use(remarkMdx).parse(body);
  const fileKey = fileKeyFor(file);
  const { hits, wraps } = collectHits(body, tree, fileKey);

  for (const h of hits) {
    if (ru[h.key] === undefined) ru[h.key] = h.text;
    if (en[h.key] === undefined) en[h.key] = '';
  }

  let count = 0;
  if (WRITE && wraps.length && file.endsWith('.mdx')) {
    const { out, count: c } = applyWraps(body, wraps);
    count = c;
    if (c > 0) {
      await writeFile(file, src.slice(0, fm.bodyStart) + out, 'utf8');
    }
  }
  return { hits, wraps: count };
}

async function main() {
  const files = await listMdx();
  const en = await readJson(EN_FILE);
  const ru = await readJson(RU_FILE);
  const enBefore = Object.keys(en).length;
  const ruBefore = Object.keys(ru).length;

  console.log(`[i18n] scanning ${files.length} files in ${path.relative(ROOT, CONTENT_ROOT)} …`);

  let totalHits = 0;
  let totalWraps = 0;
  for (const f of files) {
    try {
      const { hits, wraps } = await processFile(f, en, ru);
      const rel = path.relative(CONTENT_ROOT, f).replace(/\\/g, '/');
      console.log(`  · ${rel} → ${hits.length} hits, ${wraps} wraps`);
      totalHits += hits.length;
      totalWraps += wraps;
    } catch (err) {
      console.error(`  ! ${f}: ${err.message}`);
    }
  }

  const enAfter = Object.keys(en).length;
  const ruAfter = Object.keys(ru).length;
  console.log(`[i18n] hits total: ${totalHits}`);
  console.log(`[i18n] wraps written: ${totalWraps}`);
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
