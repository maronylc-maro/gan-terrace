# がんテラス 運用・セットアップ手順

公開URLは https://gan-terrace.link/
サイトは [Astro](https://astro.build/) で作り、Cloudflare（Workers の静的アセット）で公開する。
ソースコードは GitHub で管理し、`main` に push されるか、デプロイフックが呼ばれると、
Cloudflare が自動でビルド（`npm run build`）して公開する。

ビルドのたびに、スプレッドシートに紐づく Apps Script からデータを直接取得して、
中身の入った HTML を作る。Google Cloud やサービスアカウントは使わない。

## 日々の運用（運営者の作業）
1. スプレッドシートを編集する
2. メニュー「がんテラス → サイトに反映」を押す（PCのブラウザ版のみ。スマホアプリにはメニューが出ない）
3. 数分でサイトに反映される

- 反映を忘れても、毎日午前4〜5時ごろに自動でビルドされ、最新の内容になる
- 日付が過ぎたイベントは、ビルドのたびにHTML上の一覧から外れる（カレンダー表示には残る）
- 反映されないときは、Cloudflare の `Workers & Pages` → `gan-terrace` → `デプロイ` で、ビルドが「失敗しました」になっていないか確認する。
  失敗してもサイトは直前の状態のまま残る
- スプレッドシートの `purposes` シートが空だったり、Apps Script に接続できなかったりすると、ビルドは失敗する（古いデータや空のデータで公開しないための仕様）

## 1. 公開の仕組み（Cloudflare）
`Workers & Pages` → `gan-terrace` の設定

| 項目 | 値 |
|---|---|
| ビルドコマンド | `npm run build`（本番・ブランチの両方） |
| デプロイコマンド | `npx wrangler deploy` |
| 変数 `SHEETS_API_URL` | Apps Script のウェブアプリURL（ビルド用の変数。本番・ブランチの両方） |
| デプロイフック | 名前 `spreadsheet`、ブランチ `main`（URLは Apps Script のスクリプトプロパティに保存） |
| 公開するフォルダ | `wrangler.jsonc` の `assets.directory`（`./dist`） |

- Node.js のバージョンは `.node-version` で指定している
- `robots.txt` は Cloudflare が自動で先頭にAIの利用条件の宣言文を付け足して配信する（AIクローラーの拒否設定は入っていない）
- ページのURLは拡張子なし（`/calendar` など）。`/calendar.html` は `/calendar` に転送される

## 2. スプレッドシートの準備
同梱の `がんテラス_データ入力シート.xlsx` をGoogleドライブにアップロードし、
右クリック → `アプリで開く` → `Googleスプレッドシート` で変換する。
シート名（`events` / `news` / `facilities` / `purposes` / `purpose_items`）は変更しないこと。

### events シート（イベント）
| A:日時 | B:タイトル | C:場所 | D:概要 | E:詳細リンク | F:関連施設・団体名 |
|---|---|---|---|---|---|
| 2026-09-03 | 〇〇教室 | さくら総合病院 | 説明文 | https://... | さくら総合病院 |

- 日時は `2026-09-03` の形式で入力する（`2026/9/3` や `2026年9月3日` でも自動で変換される）
- F列（関連施設・団体名）は、`purpose_items` シートの施設・団体名と**完全に同じ文字列**を入れる。空欄でもよい

### news シート（お知らせ）
| A:日時 | B:タイトル | C:リンク |
|---|---|---|

### facilities シート（施設・団体リンク集）
| A:名称 | B:サイトURL | C:GoogleマップURL |
|---|---|---|

### purposes シート（目的別情報のカテゴリ）
| A:カテゴリID | B:カテゴリ名 | C:イラスト | D:説明文 |
|---|---|---|---|
| talk | 集う | talk.webp | 同じ経験をした人や相談員と話せる場を探せます。 |

- カテゴリIDは半角英数字。`/purpose?cat=talk` のURLと、purpose_items との紐付けに使う
- イラストは**ファイル名だけ**を入力する。画像は `public/images` フォルダに置いておく必要がある

### purpose_items シート（カテゴリごとの施設・団体）
| A:カテゴリID | B:施設・団体名 | C:リンクURL |
|---|---|---|
| talk | 患者会 ひまわりの会 | https://... |

- A列には purposes シートのカテゴリIDと同じ文字列を入れる
- 1つのカテゴリに複数の施設・団体を入れる場合は、同じカテゴリIDで行を増やす
- B列の名称は、eventsシートのF列（関連施設・団体名）と揃えると関連イベントが強調表示される

1行目は見出し行、2行目からデータ。A列が空の行は読み込まれない。
スプレッドシートのURLから **スプレッドシートID** を控える。
`https://docs.google.com/spreadsheets/d/【ここがID】/edit`

## 3. Apps Script の設定
1. スプレッドシートで `拡張機能` → `Apps Script` を開く
2. `scripts/gas/Code.gs` の中身をすべて貼り付ける
3. 上部の `SPREADSHEET_ID` を手順2で控えたIDに書き換えて保存（**本物のIDはGitHubに載せない**。リポジトリ内は仮の文字列のままにする）
4. 右上の `デプロイ` → `新しいデプロイ` → 種類を `ウェブアプリ` にして
   - 次のユーザーとして実行：`自分`
   - アクセスできるユーザー：`全員`
   でデプロイする（初回は権限の承認を求められる。「詳細」→「安全でないページに移動」で進む）
5. 発行された `https://script.google.com/macros/s/.../exec` を控える
6. 左メニュー「プロジェクトの設定」→「スクリプト プロパティ」に、`DEPLOY_HOOK_URL` として Cloudflare のデプロイフックのURLを登録する
7. 左メニュー「トリガー」→「トリガーを追加」で、`dailyRebuild` を「時間主導型・日付ベース・午前4〜5時」で登録する（エラー通知は「今すぐ通知を受け取る」）
8. スプレッドシートを開き直すと、メニュー「がんテラス」が出る。初回は権限の承認を求められる

> **なぜ「全員」にするのか**
> 公開サイトのブラウザからも読めるようにするため。公開されるのはスプレッドシートの中身ではなく、
> このスクリプトが返すイベント・お知らせ・施設リンク集・目的別情報のデータだけ（いずれもサイトに載せる情報）。
> スプレッドシート本体は非公開のまま。

## 4. 「気になる」ボタン
イベント詳細に表示される「👍 気になる」の件数は、手順3と同じApps Scriptに記録される。

1. `public/js/config.js` の `window.LIKE_API_URL` に、手順3のウェブアプリURLを設定する
2. push すると、イベント詳細に「気になる」ボタンと数字が表示される

URLが空のあいだはボタン自体が表示されない。
スプレッドシートに `likes` シートが自動で作られ、`日付|タイトル` のキーごとに件数が入る。

### 仕様上の注意
- 同じ端末では1イベント1回まで（ブラウザに記録して二度押しを防ぐ）。厳密な人数ではなく目安の数値
- スプレッドシートのイベント名や日付を後から変えるとキーが変わり、それまでの件数は引き継がれない
- Apps Script の **ウェブアプリ部分（`doGet` / `doPost`）を直したとき**は、`デプロイ` → `デプロイを管理` → 鉛筆アイコン → バージョンを「新バージョン」にして再デプロイしないと反映されない。メニューや自動ビルドの部分だけを直したときは、再デプロイは不要

## 5. ローカルでの確認（開発者向け）
1. `npm install`
2. リポジトリ直下に `.env` を作り、`SHEETS_API_URL=（ウェブアプリのURL）` と書く（`.env` はGitに載らない）
3. `npm run build` でビルド、`npm run preview` で確認する

PowerShell で `npm` が実行できないときは、そのターミナルで
`Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` を実行する。

## お問い合わせフォーム
各ページのフッターにあるお問い合わせリンクは、`src/layouts/Base.astro` の1か所にある。

## 目的別情報の編集
`purposes` と `purpose_items` の2シートに入力し、「サイトに反映」で更新する。
カテゴリを増やす場合は、`purposes` シートに行を追加し、`purpose_items` に同じカテゴリIDで
施設・団体を並べるだけでよい（コードの編集は不要）。新しいイラストを使う場合だけ、
画像ファイルを `public/images` フォルダに追加する作業が必要。

## ページ構成
| ファイル | URL | 内容 |
|---|---|---|
| `src/pages/index.astro` | `/` | トップ（目的別情報のカード＋新着一覧） |
| `src/pages/purpose.astro` | `/purpose` | 目的別情報の詳細。`/purpose?cat=talk` の形で開き、上部のボタンでカテゴリを切り替える |
| `src/pages/calendar.astro` | `/calendar` | イベントカレンダー（月／週／リスト表示、Googleカレンダー追加） |
| `src/pages/facilities.astro` | `/facilities` | 施設・団体リンク集 |
| `src/pages/sitemap.xml.ts` | `/sitemap.xml` | 検索エンジン向けのページ一覧（`src/pages/` のページから自動で作られる） |

## ファイル構成
| 場所 | 内容 |
|---|---|
| `src/pages/` | 各ページ |
| `src/layouts/Base.astro` | 全ページ共通の枠（ヘッダー・フッター・メタ情報） |
| `src/lib/data.ts` | ビルド時にApps Scriptからデータを取得して整える処理 |
| `src/lib/urls.ts` | 公開URLやページのパスの定義 |
| `public/` | そのまま公開されるファイル（`css/` `js/` `images/` `robots.txt` ほか） |
| `public/js/config.js` | 「気になる」ボタンのURL設定 |
| `scripts/gas/Code.gs` | スプレッドシート側に貼るApps Scriptのコード |
| `astro.config.mjs` | Astro の設定（公開URL、出力形式） |
| `wrangler.jsonc` | Cloudflare に公開するフォルダの指定 |
| `.node-version` | ビルドに使う Node.js のバージョン |
