/**
 * まちの医療案内 用 Google Apps Script
 *
 * このスクリプト1本で2つの役割を担う。
 *   1. サイトのデータ配信  … GitHub Actions が ?type=data で呼び出し、events / news / facilities を取得する
 *   2. 「気になる」の集計   … サイトが件数の取得（GET）と加算（POST）に使う
 *
 * セットアップ手順はサイトのREADME「スプレッドシートとApps Scriptの設定」を参照。
 */

// このスクリプトを紐づけたスプレッドシートのID
// https://docs.google.com/spreadsheets/d/【ここがID】/edit
var SPREADSHEET_ID = 'ここにスプレッドシートIDを貼る';

// 「気になる」の件数を記録するシート名（自動で作られる）
var LIKES_SHEET = 'likes';

// データシートの構成（シート名と列の並び）
var DATA_SHEETS = {
  events: ['date', 'title', 'place', 'summary', 'link', 'related'],
  news: ['date', 'title', 'link'],
  facilities: ['name', 'url', 'map'],
  purposes: ['id', 'category', 'image', 'desc'],
  purpose_items: ['catId', 'title', 'link']
};

// イラストを置いているフォルダ（purposesシートにはファイル名だけ入力する運用）
var IMAGE_DIR = 'images/';


// ===== 共通 =====

function getBook_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** 日付を YYYY-MM-DD に揃える */
function normalizeDate_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, 'Asia/Tokyo', 'yyyy-MM-dd');
  }
  var text = String(value == null ? '' : value).trim();
  if (!text) return '';

  var m = text.match(/^(\d{4})\s*[-\/.年]\s*(\d{1,2})\s*[-\/.月]\s*(\d{1,2})/);
  if (m) {
    var y = Number(m[1]);
    var mo = Number(m[2]);
    var d = Number(m[3]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2);
    }
  }
  return text;
}


// ===== 1. サイトのデータ配信 =====

function readDataSheets_() {
  var book = getBook_();
  var result = {};

  Object.keys(DATA_SHEETS).forEach(function (name) {
    var columns = DATA_SHEETS[name];
    var sheet = book.getSheetByName(name);
    var items = [];

    if (sheet) {
      var values = sheet.getDataRange().getValues();
      // 1行目は見出しなので2行目から
      for (var i = 1; i < values.length; i++) {
        var row = values[i];
        if (!row || String(row[0]).trim() === '') continue;

        var item = {};
        for (var c = 0; c < columns.length; c++) {
          var key = columns[c];
          var cell = row[c] == null ? '' : row[c];
          item[key] = (key === 'date') ? normalizeDate_(cell) : String(cell).trim();
        }
        items.push(item);
      }
    }
    result[name] = items;
  });

  // 目的別情報は2シートを1つの階層に組み立てる
  result.purposes = buildPurposes_(result.purposes, result.purpose_items);
  delete result.purpose_items;

  return result;
}

/** purposes と purpose_items を組み合わせ、サイトが読む形にする */
function buildPurposes_(categories, items) {
  var itemsById = {};
  (items || []).forEach(function (item) {
    var id = item.catId;
    if (!id) return;
    if (!itemsById[id]) itemsById[id] = [];
    itemsById[id].push({ title: item.title, link: item.link });
  });

  return (categories || []).map(function (cat) {
    var image = cat.image || '';
    if (image && image.indexOf('/') === -1) image = IMAGE_DIR + image;

    return {
      id: cat.id,
      category: cat.category,
      image: image,
      desc: cat.desc || '',
      items: itemsById[cat.id] || []
    };
  });
}


// ===== 2. 「気になる」の集計 =====

function getLikesSheet_() {
  var book = getBook_();
  var sheet = book.getSheetByName(LIKES_SHEET);
  if (!sheet) {
    sheet = book.insertSheet(LIKES_SHEET);
    sheet.appendRow(['キー（日付|タイトル）', '気になる数']);
  }
  return sheet;
}

function readLikes_() {
  var values = getLikesSheet_().getDataRange().getValues();
  var counts = {};
  for (var i = 1; i < values.length; i++) {
    var key = values[i][0];
    if (key) counts[String(key)] = Number(values[i][1]) || 0;
  }
  return counts;
}

/**
 * 送られてきたキーが eventsシートに実在するイベントのものか確かめる。
 * これを通さないと、任意の文字列で likes シートに行を追加されてしまう。
 */
function isKnownEventKey_(key) {
  var sheet = getBook_().getSheetByName('events');
  if (!sheet) return false;

  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    var date = normalizeDate_(values[i][0]);
    var title = String(values[i][1] == null ? '' : values[i][1]).trim();
    if (!date || !title) continue;
    if (date + '|' + title === key) return true;
  }
  return false;
}


// ===== エントリポイント =====

/**
 * GET
 *   ?type=data … events / news / facilities を返す（GitHub Actions から）
 *   それ以外    … 「気になる」の件数を返す（サイトから）
 */
function doGet(e) {
  try {
    var type = (e && e.parameter && e.parameter.type) || '';

    if (type === 'data') {
      return json_({ ok: true, data: readDataSheets_() });
    }
    return json_({ ok: true, counts: readLikes_() });

  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** POST … 「気になる」を1件加算し、加算後の件数を返す */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    var body = JSON.parse(e.postData.contents);
    var key = String(body.key || '').slice(0, 300);
    if (!key) return json_({ ok: false, error: 'キーがありません' });

    // 実在しないイベントは受け付けない（likesシートへの不正な行追加を防ぐ）
    if (!isKnownEventKey_(key)) {
      return json_({ ok: false, error: '対象のイベントが見つかりません' });
    }

    var sheet = getLikesSheet_();
    var values = sheet.getDataRange().getValues();

    for (var i = 1; i < values.length; i++) {
      if (String(values[i][0]) === key) {
        var next = (Number(values[i][1]) || 0) + 1;
        sheet.getRange(i + 1, 2).setValue(next);
        return json_({ ok: true, key: key, count: next });
      }
    }

    sheet.appendRow([key, 1]);
    return json_({ ok: true, key: key, count: 1 });

  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}
