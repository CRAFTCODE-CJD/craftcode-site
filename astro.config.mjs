// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mdx from '@astrojs/mdx';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  site: 'https://craftcode.pages.dev',
  vite: {
    // ~/components → src/components, ~/styles → src/styles, etc.
    // Matches the tsconfig paths entry; keeps index.mdx imports short.
    resolve: { alias: { '~': src } },
  },
  integrations: [
    starlight({
      title: 'CRAFTCODE',
      description: 'Docs + info hub for CRAFT+CODE plugins and games.',
      // Default locale is Russian at `/`. English content lives under `/en/`.
      // Translating every page is a content task — we ship the engineering
      // hookup here and backfill pages incrementally.
      defaultLocale: 'root',
      locales: {
        root: { label: 'Русский', lang: 'ru' },
        en:   { label: 'English', lang: 'en' },
      },
      logo: {
        src: './src/assets/logo.svg',
        replacesTitle: true,
      },
      favicon: '/favicon.ico',
      head: [
        { tag: 'link', attrs: { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' } },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' } },
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' } },
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' } },
        { tag: 'link', attrs: { rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;700&family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&family=Press+Start+2P&family=VT323&display=swap' } },
      ],
      customCss: [
        './src/styles/themes.css',
        './src/styles/companions.css',
        './src/styles/site.css',
      ],
      components: {
        // Override Starlight's header with our own topbar (logo, nav, theme toggle, demo panel)
        Header: './src/components/Topbar.astro',
      },
      // Explicit sidebar instead of autogenerate: the root (ru) tree has
      // nested folders per plugin (index + getting-started + reference +
      // features) while `en/` uses flat files. Autogenerate was mixing them
      // into a 20-item clutter. We keep it flat + readable.
      // Starlight auto-prefixes links for non-root locales, so one config
      // works for both Russian and English.
      sidebar: [
        {
          label: 'Plugins',
          translations: { ru: 'Плагины' },
          items: [
            { label: 'Catalog', translations: { ru: 'Каталог' }, link: '/plugins/' },
            { label: 'Sprite Optimizer', link: '/plugins/sprite-optimizer/' },
            { label: 'ManualSprite',     link: '/plugins/manualsprite/' },
            { label: 'MouseInterceptor', link: '/plugins/mouseinterceptor/' },
          ],
        },
        {
          label: 'Templates',
          translations: { ru: 'Шаблоны' },
          collapsed: true,
          items: [
            { label: 'Soon', translations: { ru: 'Скоро' }, link: '/templates/' },
          ],
        },
        { label: 'About', translations: { ru: 'О нас' }, link: '/about/' },
      ],
      // GitHub link intentionally absent — the project is not marketing
      // its source repo from the site. Plugins ship via FAB; subscriber
      // content via Boosty; video content via YouTube.
      social: {},
    }),
    mdx(),
  ],
});
