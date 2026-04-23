import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/** Shared CTA definition — used by plugin landings + templates placeholder. */
const cta = z.object({
  label: z.string(),
  href: z.string(),
  variant: z.enum(['primary', 'ghost']).optional(),
  external: z.boolean().optional(),
});

/** Key/value metadata pair — plugin stats strip. */
const metaPair = z.object({ k: z.string(), v: z.string() });

/** Workflow step shown on plugin landing (pipeline block). */
const pipelineStep = z.object({
  n: z.string(),
  title: z.string(),
  text: z.string(),
});

const galleryShot = z.object({
  n: z.string().optional(),
  src: z.string(),
  caption: z.string(),
});

const statsEntry = z.object({
  label: z.string(),
  value: z.string(),
  delta: z.string().optional(),
});

/** Docs collection. No Starlight — we load MDX/MD ourselves and render
 *  through src/layouts/Docs.astro + src/pages/[...slug].astro.              */
export const collections = {
  docs: defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: 'src/content/docs' }),
    schema: z.object({
      title: z.string(),
      description: z.string().optional(),
      /** Omit from nav / listing (used for index placeholders). */
      hidden: z.boolean().optional(),
      /** Display order within its folder. */
      order: z.number().optional(),

      // ── Plugin landing hero ──
      plugin_page: z.boolean().optional(),
      kicker: z.string().optional(),
      version: z.string().optional(),
      tagline: z.string().optional(),
      image: z.string().optional(),
      accent: z.string().optional(),
      ctas: z.array(cta).optional(),
      meta: z.array(metaPair).optional(),
      pipeline: z
        .object({ title: z.string(), steps: z.array(pipelineStep) })
        .optional(),
      gallery: z
        .object({ title: z.string(), shots: z.array(galleryShot) })
        .optional(),
      stats: z
        .object({ title: z.string(), stats: z.array(statsEntry) })
        .optional(),
    }),
  }),
};
