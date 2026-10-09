import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';
import remarkSlug from 'remark-slug';
import remarkAutolinkHeadings from 'remark-autolink-headings';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import forceUtf8ForHtml from "./src/plugins/vite-plugin-force-utf8.js";

export default defineConfig({
  site: 'https://www.astrosyo.com',
  redirects: {
    '/cosmic-stories': '/stories',
  },
  integrations: [
    mdx({
      remarkPlugins: [
        [remarkMath, { singleDollarTextMath: false }], // << disable $...$ inline math
        remarkSlug,
        remarkAutolinkHeadings,
      ],
      rehypePlugins: [
        rehypeKatex,
      ],
    }),
    sitemap(),
    react(),
    icon({ collections: ['logos','bi','feather','ion'] }),
  ],
  vite: {
    optimizeDeps: {
      // Prevent mid-navigation re-optimizations that can yield 504 "Outdated Optimize Dep"
      // and break island hydration on first load during dev.
      include: [
        'react',
        'react-dom',
        'three',
        'three/addons/misc/GPUComputationRenderer.js',
        'lucide-react',
        'katex',
        '@supabase/supabase-js',
      ],
    },
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        '@layouts': fileURLToPath(new URL('./src/layouts', import.meta.url)),
        '@components': fileURLToPath(new URL('./src/components', import.meta.url)),
      },
    },
    plugins: [
      tailwindcss(),
      forceUtf8ForHtml(),
    ],
    esbuild: {
      charset: "utf8",
    },
  },
});
