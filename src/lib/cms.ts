// microCMS から記事を取得する（ビルド時のみ）。
//
// 取得に失敗したときは、ビルドを失敗させる（記事が消えた状態で公開しないため）。
// 失敗してもサイトは直前の状態のまま残る。
//
// 必要な環境変数（Cloudflare のビルド用変数。ローカルでは .env）
//   MICROCMS_SERVICE_DOMAIN : サービスID（例: gan-terrace）
//   MICROCMS_API_KEY        : APIキー（シークレット）

export const KINDS = ['道案内', 'ブログ', 'お知らせ', '固定ページ'] as const;
export type Kind = (typeof KINDS)[number];

/** 一覧・新着に出す種類（固定ページは URL を知っている人向けで、一覧には出さない） */
export const LISTED_KINDS: Kind[] = ['道案内', 'ブログ', 'お知らせ'];

export interface Article {
  id: string;
  title: string;
  kind: Kind;
  description: string;
  eyecatch?: { url: string; width?: number; height?: number };
  /** 記事本文（HTML）。表示用に整えたもの */
  body: string;
  /** 公開日（日本時間, YYYY-MM-DD） */
  date: string;
  /** 更新日（日本時間, YYYY-MM-DD） */
  updated: string;
  /** 公開日時・更新日時（ISO形式。構造化データ用） */
  publishedAt: string;
  revisedAt: string;
}

// ===== 取得 =====

const TIMEOUT_MS = 60_000;
const ATTEMPTS = 3;
const LIMIT = 100;

function env(name: string): string {
  const value = (process.env[name] || (import.meta.env as Record<string, string>)[name] || '').trim();
  if (!value) {
    throw new Error(
      `${name} が設定されていません。` +
        'Cloudflare の Settings → ビルド → 変数とシークレット（ローカルでは .env ファイル）に登録してください。',
    );
  }
  return value;
}

async function fetchPage(offset: number): Promise<{ contents: any[]; totalCount: number }> {
  const domain = env('MICROCMS_SERVICE_DOMAIN');
  const key = env('MICROCMS_API_KEY');
  const url = `https://${domain}.microcms.io/api/v1/articles?limit=${LIMIT}&offset=${offset}&orders=-publishedAt`;

  let lastError: unknown;
  for (let i = 1; i <= ATTEMPTS; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'X-MICROCMS-API-KEY': key },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`microCMS への接続に失敗しました（HTTP ${res.status}）`);
      return (await res.json()) as { contents: any[]; totalCount: number };
    } catch (err) {
      lastError = err;
      console.warn(`[cms] 取得に失敗（${i}/${ATTEMPTS}回目）: ${err}`);
      if (i < ATTEMPTS) await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error(`記事の取得に失敗しました: ${lastError}`);
}

async function fetchAll(): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;
  while (true) {
    const page = await fetchPage(offset);
    all.push(...page.contents);
    offset += LIMIT;
    if (offset >= page.totalCount) break;
  }
  return all;
}

// ===== 整形 =====

/** ISO日時 → 日本時間の YYYY-MM-DD */
export function jstDate(iso: string): string {
  return new Date(Date.parse(iso) + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 画像URLに、表示サイズなどの指定を付ける（microCMS の画像変換機能） */
export function img(url: string, params: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}${params}`;
}

/**
 * 本文HTMLを表示用に整える。
 *  - 見出しを1段下げる（ページの h1 は記事タイトル。本文の見出し1 → h2 ...）
 *  - 画像を軽くする（幅960px・WebP・遅延読み込み）
 *  - 表を横スクロールできるように包む（スマホ対策）。道案内は最初の表を「案内ボックス」にする
 */
function formatBody(html: string, kind: Kind): string {
  let out = html;

  out = out.replace(/<(\/?)h([1-5])(?=[\s>])/g, (_m, slash, n) => `<${slash}h${Number(n) + 1}`);

  out = out.replace(/<img\b([^>]*?)\/?>/g, (_m, attrs: string) => {
    let a = attrs.replace(/src="(https:\/\/images\.microcms-assets\.io\/[^"?]+)"/, 'src="$1?w=960&fm=webp"');
    if (!/\sloading=/.test(a)) a += ' loading="lazy"';
    if (!/\sdecoding=/.test(a)) a += ' decoding="async"';
    return `<img${a}>`;
  });

  let tableCount = 0;
  out = out.replace(/<table\b[^>]*>[\s\S]*?<\/table>/g, (table) => {
    tableCount++;
    const cls = kind === '道案内' && tableCount === 1 ? 'table-scroll route-summary' : 'table-scroll';
    return `<div class="${cls}">${table}</div>`;
  });

  return out;
}

function toArticle(raw: any): Article {
  const kindRaw = Array.isArray(raw.kind) ? raw.kind[0] : raw.kind;
  const kind: Kind = (KINDS as readonly string[]).includes(kindRaw) ? kindRaw : 'ブログ';
  const publishedAt = raw.publishedAt || raw.createdAt;
  const revisedAt = raw.revisedAt || raw.updatedAt || publishedAt;

  return {
    id: String(raw.id),
    title: String(raw.title ?? '').trim(),
    kind,
    description: String(raw.description ?? '').trim(),
    eyecatch: raw.eyecatch?.url ? raw.eyecatch : undefined,
    body: formatBody(String(raw.body ?? ''), kind),
    date: jstDate(publishedAt),
    updated: jstDate(revisedAt),
    publishedAt,
    revisedAt,
  };
}

const raws = await fetchAll();

/** 公開日の新しい順 */
export const articles: Article[] = raws.map(toArticle);

console.log(`[cms] articles ${articles.length}`);
