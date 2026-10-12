// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  // 公開URL（canonical や sitemap の元になる）
  site: 'https://gan-terrace.link',

  // 完成したHTMLだけを書き出す（サーバー処理なし）
  output: 'static',

  build: {
    // purpose.html のように「ページ名.html」で書き出す。
    // Cloudflare はこれを /purpose というURLで配信する。
    format: 'file',
  },

  devToolbar: { enabled: false },
});
