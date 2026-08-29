let ALL_EVENTS = [];
let CURRENT_VIEW = 'month';
let CURRENT_DATE = new Date();
let HIGHLIGHT_KEY = null; // 目的別情報からの絞り込みキー（施設・団体名）

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

function toKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function eventsOnDate(dateKey) {
  return ALL_EVENTS.filter(e => e.date === dateKey);
}

function isHighlighted(event) {
  return HIGHLIGHT_KEY && event.related === HIGHLIGHT_KEY;
}

async function initCalendar() {
  ALL_EVENTS = await loadJSON('data/events.json');

  const params = new URLSearchParams(window.location.search);
  HIGHLIGHT_KEY = params.get('related');
  renderFilterNote();

  document.getElementById('view-month').addEventListener('click', () => switchView('month'));
  document.getElementById('view-week').addEventListener('click', () => switchView('week'));
  document.getElementById('view-list').addEventListener('click', () => switchView('list'));
  document.getElementById('nav-prev').addEventListener('click', () => shift(-1));
  document.getElementById('nav-next').addEventListener('click', () => shift(1));
  document.getElementById('nav-today').addEventListener('click', () => { CURRENT_DATE = new Date(); render(); });

  render();

  // 「気になる」の件数はカレンダー表示を待たせず、あとから取得する
  if (typeof loadLikes === 'function') loadLikes();
}

function renderFilterNote() {
  const box = document.getElementById('filter-note');
  if (!box) return;
  if (!HIGHLIGHT_KEY) {
    box.innerHTML = '';
    return;
  }
  const hit = ALL_EVENTS.filter(e => e.related === HIGHLIGHT_KEY).length;
  const firstDate = ALL_EVENTS.filter(e => e.related === HIGHLIGHT_KEY)
    .map(e => e.date).sort()[0];
  if (firstDate) CURRENT_DATE = new Date(firstDate + 'T00:00:00');

  box.innerHTML = `
    <div class="filter-note">
      <span class="swatch"></span>
      <span>「${HIGHLIGHT_KEY}」の関連イベント${hit}件を色付きで表示しています</span>
      <a class="clear" href="calendar.html">解除して全体を見る</a>
    </div>`;
}

function switchView(view) {
  CURRENT_VIEW = view;
  document.querySelectorAll('.view-switch button').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  render();
}

function shift(dir) {
  const d = new Date(CURRENT_DATE);
  if (CURRENT_VIEW === 'month') d.setMonth(d.getMonth() + dir);
  else if (CURRENT_VIEW === 'week') d.setDate(d.getDate() + dir * 7);
  else d.setMonth(d.getMonth() + dir);
  CURRENT_DATE = d;
  render();
}

function render() {
  const titleEl = document.getElementById('calendar-title');
  const body = document.getElementById('calendar-body');
  body.innerHTML = '';

  if (CURRENT_VIEW === 'month') {
    titleEl.textContent = `${CURRENT_DATE.getFullYear()}年${CURRENT_DATE.getMonth() + 1}月`;
    renderMonth(body);
  } else if (CURRENT_VIEW === 'week') {
    const { start, end } = weekRange(CURRENT_DATE);
    titleEl.textContent = `${formatRangeLabel(start)} 〜 ${formatRangeLabel(end)}`;
    renderWeek(body, start);
  } else {
    titleEl.textContent = `${CURRENT_DATE.getFullYear()}年${CURRENT_DATE.getMonth() + 1}月 の予定`;
    renderList(body);
  }
}

function formatRangeLabel(d) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function weekRange(d) {
  const start = new Date(d);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start, end };
}

function renderMonth(body) {
  const grid = document.createElement('div');
  grid.className = 'month-grid';
  DOW.forEach(d => {
    const el = document.createElement('div');
    el.className = 'dow';
    el.textContent = d;
    grid.appendChild(el);
  });

  const year = CURRENT_DATE.getFullYear();
  const month = CURRENT_DATE.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const gridStart = new Date(year, month, 1 - startOffset);
  const today = toKey(new Date());

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cellCount = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  for (let i = 0; i < cellCount; i++) {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    const key = toKey(d);
    const cell = document.createElement('div');
    cell.className = 'day-cell';
    if (d.getMonth() !== month) cell.classList.add('other-month');
    if (key === today) cell.classList.add('today');

    const num = document.createElement('div');
    num.className = 'day-num';
    num.textContent = d.getDate();
    cell.appendChild(num);

    const evs = eventsOnDate(key);
    evs.forEach(ev => {
      const pill = document.createElement('span');
      pill.className = 'event-pill' + (isHighlighted(ev) ? ' highlight' : '');
      pill.textContent = ev.title;
      cell.appendChild(pill);
    });

    if (evs.length) {
      cell.classList.add('has-event');
      cell.setAttribute('role', 'button');
      cell.setAttribute('tabindex', '0');
      cell.addEventListener('click', () => showDayPopup(key, evs, HIGHLIGHT_KEY));
      cell.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showDayPopup(key, evs, HIGHLIGHT_KEY);
        }
      });
    }

    grid.appendChild(cell);
  }
  body.appendChild(grid);
}

function renderWeek(body, start) {
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = toKey(d);
    const row = document.createElement('div');
    row.className = 'week-row';

    const dateEl = document.createElement('div');
    dateEl.className = 'week-date';
    dateEl.textContent = `${d.getMonth() + 1}/${d.getDate()}（${DOW[d.getDay()]}）`;
    row.appendChild(dateEl);

    const evWrap = document.createElement('div');
    evWrap.className = 'week-events';
    const evs = eventsOnDate(key);
    if (evs.length === 0) {
      evWrap.innerHTML = '<span class="empty-note" style="padding:0;">予定はありません</span>';
    } else {
      evs.forEach(ev => {
        const pill = document.createElement('button');
        pill.className = 'event-pill' + (isHighlighted(ev) ? ' highlight' : '');
        pill.style.marginBottom = '4px';
        pill.textContent = `${ev.title}（${ev.place}）`;
        pill.addEventListener('click', () => showDayPopup(key, evs, HIGHLIGHT_KEY));
        evWrap.appendChild(pill);
      });
    }
    row.appendChild(evWrap);
    body.appendChild(row);
  }
}

function renderList(body) {
  const year = CURRENT_DATE.getFullYear();
  const month = CURRENT_DATE.getMonth();
  const monthEvents = ALL_EVENTS
    .filter(e => {
      const d = new Date(e.date + 'T00:00:00');
      return d.getFullYear() === year && d.getMonth() === month;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  if (monthEvents.length === 0) {
    body.innerHTML = '<p class="empty-note">この月の予定はありません</p>';
    return;
  }

  // 同じ日のイベントは1行にまとめる
  const byDate = new Map();
  monthEvents.forEach(ev => {
    if (!byDate.has(ev.date)) byDate.set(ev.date, []);
    byDate.get(ev.date).push(ev);
  });

  byDate.forEach((evs, dateKey) => {
    const row = document.createElement('div');
    row.className = 'list-row';
    const dateEl = document.createElement('div');
    dateEl.className = 'list-date';
    dateEl.textContent = formatDate(dateKey);
    row.appendChild(dateEl);

    const wrap = document.createElement('div');
    wrap.className = 'list-events';
    evs.forEach(ev => {
      const pill = document.createElement('button');
      pill.className = 'event-pill' + (isHighlighted(ev) ? ' highlight' : '');
      pill.style.whiteSpace = 'normal';
      pill.style.marginBottom = '4px';
      pill.textContent = `${ev.title}（${ev.place}）`;
      pill.addEventListener('click', () => showDayPopup(dateKey, evs, HIGHLIGHT_KEY));
      wrap.appendChild(pill);
    });
    row.appendChild(wrap);
    body.appendChild(row);
  });
}

document.addEventListener('DOMContentLoaded', initCalendar);
