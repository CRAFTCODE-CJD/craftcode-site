/* ══════════════════════════════════════════════════════
   CRAFTCODE — Plugin manifest loader (Read.txt §3, §13.10)
   ══════════════════════════════════════════════════════
   Build-time fetch of per-plugin manifest.json from GitHub,
   with local snapshot fallback. Bilingual name/description
   per Read.txt §13.10.

   Plugin repos (github.com/CRAFTCODE-CJD):
     - Sprite-Optimizer
     - ManualSprite
     - MouseInterceptor
                                                              */

// Static imports: bundler inlines these JSON files into the build so
// loadManifest() has a fallback even when there's no network at build time
// and the relative filesystem path is fragile after compilation.
import spriteOptimizerSnap from '../../../public/manifests/sprite-optimizer.json' with { type: 'json' };
import manualspriteSnap from '../../../public/manifests/manualsprite.json' with { type: 'json' };
import mouseinterceptorSnap from '../../../public/manifests/mouseinterceptor.json' with { type: 'json' };

export type Lang = 'en' | 'ru';

export interface LocalizedString {
  en: string;
  ru: string;
}

export interface PluginManifest {
  /** Slug used in URLs (matches content/docs/plugins/<slug>/). */
  slug: string;
  /** GitHub repository name under CRAFTCODE-CJD org. */
  repo: string;
  name: LocalizedString;
  version: string;
  description: LocalizedString;
  image?: string;
  video?: string;
  docs?: string;
  /** ISO-8601 timestamp. */
  updated: string;
  /** Accent color (hex). Optional — falls back to site default. */
  accent?: string;
}

/** Pick a localized value with EN fallback (Read.txt §13.11). */
export function pick(ls: LocalizedString | string, lang: Lang): string {
  if (typeof ls === 'string') return ls;
  return ls[lang] ?? ls.en ?? '';
}

/** Registry of plugins tracked by the site. Keep in sync with content docs. */
export const PLUGIN_REGISTRY: Array<{ slug: string; repo: string }> = [
  { slug: 'sprite-optimizer', repo: 'Sprite-Optimizer' },
  { slug: 'manualsprite', repo: 'ManualSprite' },
  { slug: 'mouseinterceptor', repo: 'MouseInterceptor' },
];

const ORG = 'CRAFTCODE-CJD';
const RAW_BASE = `https://raw.githubusercontent.com/${ORG}`;

async function fetchRemote(repo: string): Promise<PluginManifest | null> {
  const url = `${RAW_BASE}/${repo}/main/manifest.json`;
  try {
    const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
    if (!res.ok) return null;
    return (await res.json()) as PluginManifest;
  } catch {
    return null;
  }
}

const SNAPSHOTS: Record<string, PluginManifest> = {
  'sprite-optimizer': spriteOptimizerSnap as PluginManifest,
  'manualsprite': manualspriteSnap as PluginManifest,
  'mouseinterceptor': mouseinterceptorSnap as PluginManifest,
};

function readSnapshot(slug: string): PluginManifest | null {
  return SNAPSHOTS[slug] ?? null;
}

/** Fetch one manifest with remote → snapshot fallback. */
export async function loadManifest(slug: string): Promise<PluginManifest | null> {
  const entry = PLUGIN_REGISTRY.find((p) => p.slug === slug);
  if (!entry) return null;
  const remote = await fetchRemote(entry.repo);
  if (remote) return { ...remote, slug: entry.slug, repo: entry.repo };
  const snap = readSnapshot(slug);
  if (snap) return { ...snap, slug: entry.slug, repo: entry.repo };
  return null;
}

/** Fetch all registered plugins in parallel. Skips nulls. */
export async function loadAllManifests(): Promise<PluginManifest[]> {
  const results = await Promise.all(PLUGIN_REGISTRY.map((p) => loadManifest(p.slug)));
  return results.filter((m): m is PluginManifest => m !== null);
}

/** Sort manifests by updated timestamp, newest first. */
export function sortByUpdated(manifests: PluginManifest[]): PluginManifest[] {
  return [...manifests].sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated));
}
