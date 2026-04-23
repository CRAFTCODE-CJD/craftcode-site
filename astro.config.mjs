// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  site: 'https://craftcode.pages.dev',
  vite: {
    resolve: { alias: { '~': src } },
  },
  integrations: [react(), mdx()],
});
