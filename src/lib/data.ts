// ビルド時にデータを読み込む。
//
// いまは、GitHub Actions が更新する data/*.json を読む。
// （次の段階で、Apps Script から直接取得する方式に置き換える）
import fs from 'node:fs';
import path from 'node:path';

export interface EventItem {
  date: string;
  title: string;
  place: string;
  summary: string;
  link: string;
  related: string;
}

export interface NewsItem {
  date: string;
  title: string;
  link: string;
}

export interface Facility {
  name: string;
  url: string;
  map: string;
}

export interface PurposeItem {
  title: string;
  link: string;
}

export interface Purpose {
  id: string;
  category: string;
  image: string;
  desc: string;
  items: PurposeItem[];
}

function readJson<T>(name: string): T {
  const file = path.join(process.cwd(), 'data', `${name}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
}

export const events = readJson<EventItem[]>('events');
export const news = readJson<NewsItem[]>('news');
export const facilities = readJson<Facility[]>('facilities');
export const purposes = readJson<Purpose[]>('purposes').map((p) => ({
  ...p,
  // 画像パスはサイトのルートからの絶対パスにそろえる（images/talk.webp → /images/talk.webp）
  image: p.image && !p.image.startsWith('/') ? `/${p.image}` : p.image,
}));

// ===== 日付まわり =====

/** 日本時間の「今日」を YYYY-MM-DD で返す（Cloudflareのビルドは世界標準時で動くため） */
export function todayJst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

function parts(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { y, m, d, dow: DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] };
}

/** 9月3日 */
export function formatDate(dateStr: string): string {
  const { m, d } = parts(dateStr);
  return `${m}月${d}日`;
}

/** 9/3（木） */
export function formatShortDate(dateStr: string): string {
  const { m, d, dow } = parts(dateStr);
  return `${m}/${d}（${dow}）`;
}

/** 2026年9月 */
export function formatMonth(dateStr: string): string {
  const { y, m } = parts(dateStr);
  return `${y}年${m}月`;
}
