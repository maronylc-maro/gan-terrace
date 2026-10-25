// サイト内のURLをここで一括管理する。
//
// Cloudflare は purpose.html を /purpose というURLで配信し、
// /purpose.html へのアクセスは /purpose に転送する。
// そのため、リンク・canonical・sitemap はすべて .html なしのURLにそろえる。
export const SITE_URL = 'https://gan-terrace.link';

export const paths = {
  home: '/',
  purpose: '/purpose',
  calendar: '/calendar',
  facilities: '/facilities',
  articles: '/articles',
} as const;

/** 目的別情報の詳細ページ（カテゴリ指定つき） */
export const purposeCat = (id: string) => `${paths.purpose}?cat=${encodeURIComponent(id)}`;

/** カレンダー（関連イベントの色付き表示つき） */
export const calendarRelated = (name: string) =>
  `${paths.calendar}?related=${encodeURIComponent(name)}`;

/** 記事ページ */
export const articlePath = (id: string) => `${paths.articles}/${encodeURIComponent(id)}`;

/** canonical 用の完全なURL */
export const canonical = (pathname: string) =>
  pathname === '/' ? `${SITE_URL}/` : `${SITE_URL}${pathname}`;
