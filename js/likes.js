// 「気になる」ボタン（Google Apps Script＋スプレッドシートに件数を保存）

const LIKE_STORAGE_KEY = 'machino-iryou-likes';
let LIKE_COUNTS = {};

function likeEnabled() {
  return !!(window.LIKE_API_URL && window.LIKE_API_URL.trim());
}

// イベントを一意に表すキー（日付＋タイトル）
function likeKey(ev) {
  return `${ev.date}|${ev.title}`;
}

async function loadLikes() {
  if (!likeEnabled()) return;
  try {
    const res = await fetch(window.LIKE_API_URL, { method: 'GET' });
    const data = await res.json();
    if (data && data.counts) LIKE_COUNTS = data.counts;
  } catch (e) {
    console.error('気になる数の取得に失敗しました', e);
  }
}

function likedKeys() {
  try {
    return JSON.parse(localStorage.getItem(LIKE_STORAGE_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function hasLiked(key) {
  return likedKeys().indexOf(key) !== -1;
}

function markLiked(key) {
  try {
    const list = likedKeys();
    if (list.indexOf(key) === -1) {
      list.push(key);
      localStorage.setItem(LIKE_STORAGE_KEY, JSON.stringify(list));
    }
  } catch (e) {
    // プライベートモードなどで保存できない場合は無視する
  }
}

function likeButtonHtml(ev) {
  if (!likeEnabled()) return '';
  const key = likeKey(ev);
  const count = LIKE_COUNTS[key] || 0;
  const done = hasLiked(key);
  return `
    <button type="button" class="like-btn${done ? ' liked' : ''}" data-key="${key}"
            ${done ? 'disabled' : ''} title="${done ? '気になるを送信済みです' : '気になる'}">
      <span class="like-icon" aria-hidden="true">👍</span>
      <span class="like-label">気になる</span>
      <span class="like-count">${count}</span>
    </button>`;
}

async function sendLike(btn) {
  const key = btn.dataset.key;
  if (!key || hasLiked(key)) return;

  const countEl = btn.querySelector('.like-count');
  const before = LIKE_COUNTS[key] || 0;

  // 先に画面へ反映し、あとから正しい値で上書きする
  btn.disabled = true;
  btn.classList.add('liked');
  LIKE_COUNTS[key] = before + 1;
  countEl.textContent = LIKE_COUNTS[key];

  try {
    const res = await fetch(window.LIKE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ key: key })
    });
    const data = await res.json();

    if (!data || !data.ok || typeof data.count !== 'number') {
      throw new Error((data && data.error) || '送信に失敗しました');
    }

    LIKE_COUNTS[key] = data.count;
    countEl.textContent = data.count;
    markLiked(key);
    btn.title = '気になるを送信済みです';

  } catch (e) {
    // 失敗したら表示を元に戻し、もう一度押せるようにする
    console.error('気になるの送信に失敗しました', e);
    LIKE_COUNTS[key] = before;
    countEl.textContent = before;
    btn.classList.remove('liked');
    btn.disabled = false;
  }
}

document.addEventListener('click', e => {
  const btn = e.target.closest('.like-btn');
  if (btn && !btn.disabled) sendLike(btn);
});
