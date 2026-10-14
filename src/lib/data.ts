// ビルド時にデータを取得する。
//
// スプレッドシート（Apps Script）から、ビルドのたびに最新のデータを直接取得する。
// 取得に失敗したときは、ビルドを失敗させる（古いデータや空のデータで公開しないため）。
// 失敗してもサイトは直前の状態のまま残る。

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

// ===== 取得 =====

const TIMEOUT_MS = 60_000;
const ATTEMPTS = 3;

function apiUrl(): string {
  // Cloudflare の環境変数、またはローカルの .env ファイルから読む
  const url = (process.env.SHEETS_API_URL || import.meta.env.SHEETS_API_URL || '').trim();
  if (!url) {
    throw new Error(
      'SHEETS_API_URL が設定されていません。' +
        'Cloudflare の Settings → Variables and Secrets（ローカルでは .env ファイル）に、' +
        'Apps Script のウェブアプリURLを登録してください。',
    );
  }
  return url;
}

async function fetchOnce(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'gan-terrace-build' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Apps Script への接続に失敗しました（HTTP ${res.status}）`);

  const payload = (await res.json()) as { ok?: boolean; error?: string; data?: unknown };
  if (!payload.ok) throw new Error(`Apps Script がエラーを返しました: ${payload.error}`);
  if (!payload.data || typeof payload.data !== 'object') {
    throw new Error('Apps Script の応答に data が含まれていません');
  }
  return payload.data as Record<string, unknown>;
}

async function fetchData(): Promise<Record<string, unknown>> {
  const base = apiUrl();
  const url = `${base}${base.includes('?') ? '&' : '?'}type=data`;

  let lastError: unknown;
  for (let i = 1; i <= ATTEMPTS; i++) {
    try {
      return await fetchOnce(url);
    } catch (err) {
      lastError = err;
      console.warn(`[data] 取得に失敗（${i}/${ATTEMPTS}回目）: ${err}`);
      if (i < ATTEMPTS) await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error(`データの取得に失敗しました: ${lastError}`);
}

// ===== 整形（以前 scripts/sync_sheets.py で行っていた処理） =====

/** 日付表記を YYYY-MM-DD にそろえる（「2026/9/3」「2026年9月3日」など）。判定できなければそのまま返す */
function normalizeDate(value: unknown): string {
  const text = String(value ?? '').trim();
  const m = text.match(/^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/);
  if (!m) return text;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return text;
  return dt.toISOString().slice(0, 10);
}

/** 余白を落とし、日付をそろえ、先頭の列（日付など）が空の行を除く */
function cleanItems<T>(items: unknown): T[] {
  const result: Record<string, string>[] = [];
  if (!Array.isArray(items)) return [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const cleaned: Record<string, string> = {};
    for (const [key, value] of Object.entries(item)) {
      const v = String(value ?? '').trim();
      cleaned[key] = key === 'date' ? normalizeDate(v) : v;
    }
    const first = Object.keys(cleaned)[0];
    if (first && !cleaned[first]) continue;
    result.push(cleaned);
  }
  return result as unknown as T[];
}

/** 目的別情報。IDと名前が揃っているカテゴリだけ残す */
function cleanPurposes(categories: unknown): Purpose[] {
  const result: Purpose[] = [];
  if (!Array.isArray(categories)) return result;
  for (const c of categories) {
    if (!c || typeof c !== 'object') continue;
    const cat = c as Record<string, unknown>;
    const id = String(cat.id ?? '').trim();
    const name = String(cat.category ?? '').trim();
    if (!id || !name) continue;

    // 画像はファイル名だけ入力される運用。サイトのルートからの絶対パスにそろえる
    let image = String(cat.image ?? '').trim();
    if (image && !image.includes('/')) image = `images/${image}`;
    if (image && !image.startsWith('/')) image = `/${image}`;

    const items: PurposeItem[] = [];
    for (const it of Array.isArray(cat.items) ? cat.items : []) {
      if (!it || typeof it !== 'object') continue;
      const title = String((it as Record<string, unknown>).title ?? '').trim();
      if (!title) continue;
      items.push({ title, link: String((it as Record<string, unknown>).link ?? '').trim() });
    }

    result.push({ id, category: name, image, desc: String(cat.desc ?? '').trim(), items });
  }
  return result;
}

const raw = await fetchData();

export const events = cleanItems<EventItem>(raw.events);
export const news = cleanItems<NewsItem>(raw.news);
export const facilities = cleanItems<Facility>(raw.facilities);
export const purposes = cleanPurposes(raw.purposes);

// 目的別情報が空のまま公開するとトップページが空になるため、ビルドを止める
if (purposes.length === 0) {
  throw new Error('目的別情報（purposes）が空です。スプレッドシートの入力を確認してください。');
}

console.log(
  `[data] events ${events.length} / news ${news.length} / facilities ${facilities.length} / purposes ${purposes.length}`,
);

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
