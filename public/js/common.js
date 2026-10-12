// データ読み込み共通処理
//
// スプレッドシートを反映してもブラウザが古い内容を表示し続けないよう、
// URLの末尾に1分ごとに変わる値を付けて、必ず最新を取りに行かせる。
async function loadJSON(path) {
  try {
    const version = Math.floor(Date.now() / 60000);
    const url = path + (path.includes('?') ? '&' : '?') + 'v=' + version;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('読み込み失敗: ' + path);
    return await res.json();
  } catch (e) {
    console.error(e);
    return [];
  }
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatDateWithYear(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

// 週表示・リスト表示で使う短い日付（例: 9/3（木））
function formatShortDate(dateStr) {
  const dow = ['日', '月', '火', '水', '木', '金', '土'];
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}（${dow[d.getDay()]}）`;
}

function formatDateWithDow(dateStr) {
  const dow = ['日', '月', '火', '水', '木', '金', '土'];
  const d = new Date(dateStr + 'T00:00:00');
  return `${formatDateWithYear(dateStr)}（${dow[d.getDay()]}）`;
}

// Googleカレンダー追加用リンクを生成
function buildGoogleCalendarUrl(event) {
  const start = event.date.replace(/-/g, '');
  const d = new Date(event.date + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  const end = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${start}/${end}`,
    details: `${event.summary}\n詳細: ${event.link}`,
    location: event.place
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// その日のイベントをまとめて表示するポップアップ
function showDayPopup(dateKey, events, highlightKey) {
  const overlay = document.getElementById('event-overlay');
  const box = document.getElementById('event-popup-body');

  box.innerHTML = `
    <div class="popup-head">
      <button class="popup-close" onclick="closeEventPopup()" aria-label="閉じる">×</button>
      <h3 class="popup-day">${formatDateWithDow(dateKey)}</h3>
      <p class="popup-count">${events.length}件のイベント</p>
    </div>
    <div class="popup-day-list">
      ${events.map(ev => `
        <div class="popup-event${highlightKey && ev.related === highlightKey ? ' highlight' : ''}">
          <div class="pe-title">${ev.title}</div>
          <div class="pe-place">${ev.place}</div>
          <p class="pe-summary">${ev.summary}</p>
          <div class="pe-actions">
            <a class="detail-link" href="${ev.link}" target="_blank" rel="noopener">詳細コチラ</a>
            <a class="gcal-link" href="${buildGoogleCalendarUrl(ev)}" target="_blank" rel="noopener">Googleカレンダーに追加</a>
            ${typeof likeButtonHtml === 'function' ? likeButtonHtml(ev) : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;

  overlay.classList.add('open');
  box.scrollTop = 0;
  document.body.classList.add('popup-open');

  // 「気になる」の件数がまだ取得中なら、届いた時点で数字を差し替える
  if (typeof LIKES_LOADED !== 'undefined' && LIKES_LOADED) {
    LIKES_LOADED.then(() => refreshLikeCounts(box));
  }
}

function closeEventPopup() {
  document.getElementById('event-overlay').classList.remove('open');
  document.body.classList.remove('popup-open');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeEventPopup();
});
