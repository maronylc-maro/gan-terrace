// sitemap.xml を自動で作る。
//
// src/pages/ にページ（.astro）を足すと、ビルドのたびに自動で載る。手で編集しない。
// 記事（microCMS）も、公開されているものがすべて載る。
// （Search Console やrobots.txt が /sitemap.xml を指しているため、このURLで書き出す）
import type { APIRoute } from 'astro';
import { articles } from '../lib/cms';
import { articlePath, canonical } from '../lib/urls';

const pages = import.meta.glob('./*.astro');

export const GET: APIRoute = () => {
  const pagePaths = Object.keys(pages)
    .map((file) => file.replace('./', '').replace('.astro', ''))
    .map((name) => (name === 'index' ? '/' : `/${name}`));

  const entries = [
    ...pagePaths.map((p) => ({ loc: canonical(p), lastmod: '' })),
    { loc: canonical('/articles'), lastmod: '' },
    ...articles.map((a) => ({ loc: canonical(articlePath(a.id)), lastmod: a.updated })),
  ].sort((a, b) => a.loc.localeCompare(b.loc));

  const urls = entries
    .map(
      (e) =>
        `  <url>\n    <loc>${e.loc}</loc>${e.lastmod ? `\n    <lastmod>${e.lastmod}</lastmod>` : ''}\n  </url>`,
    )
    .join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
