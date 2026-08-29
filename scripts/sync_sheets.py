"""
Apps Script（スプレッドシート）からデータを取得し、data/*.json を更新するスクリプト。
GitHub Actions のワークフロー（.github/workflows/sync-data.yml）から実行される想定。

必要な環境変数（GitHub Secretsで設定）:
  SHEETS_API_URL : Apps ScriptのウェブアプリURL（https://script.google.com/macros/s/.../exec）

Apps Script 側は scripts/gas/Code.gs。?type=data で
{"ok": true, "data": {"events": [...], "news": [...], "facilities": [...]}}
を返す。
"""

import datetime
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

# 1件1行のデータ（そのまま配列として書き出す）
OUTPUTS = {
    "events": "data/events.json",
    "news": "data/news.json",
    "facilities": "data/facilities.json",
}

# 目的別情報（カテゴリの中に施設・団体が入る階層構造）
PURPOSES_OUTPUT = "data/purposes.json"

TIMEOUT_SECONDS = 60


def fetch_data(api_url):
    """Apps Script から全シートのデータをまとめて取得する。"""
    separator = "&" if "?" in api_url else "?"
    url = f"{api_url}{separator}type=data"

    request = urllib.request.Request(url, headers={"User-Agent": "medical-site-sync"})
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        payload = json.loads(response.read().decode("utf-8"))

    if not payload.get("ok"):
        raise RuntimeError(f"Apps Script がエラーを返しました: {payload.get('error')}")

    data = payload.get("data")
    if not isinstance(data, dict):
        raise RuntimeError("Apps Script の応答に data が含まれていません")

    return data


def normalize_date(value):
    """日付表記を YYYY-MM-DD に揃える。

    「2026-09-03」「2026/9/3」「2026年9月3日」を受け付ける。
    判定できない場合は入力をそのまま返す。
    """
    text = str(value).strip()
    if not text:
        return ""

    match = re.match(r"^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})", text)
    if match:
        year, month, day = (int(group) for group in match.groups())
        try:
            return datetime.date(year, month, day).isoformat()
        except ValueError:
            return text

    return text


def clean_items(items):
    """余白を落とし、日付を整えたうえで、日付が空の行を除く。"""
    result = []
    for item in items:
        if not isinstance(item, dict):
            continue
        cleaned = {}
        for key, value in item.items():
            value = str(value if value is not None else "").strip()
            if key == "date":
                value = normalize_date(value)
            cleaned[key] = value

        first_key = next(iter(cleaned), None)
        if first_key and not cleaned[first_key]:
            continue
        result.append(cleaned)
    return result


def clean_purposes(categories):
    """カテゴリの階層データを整える。IDと名前が揃っている行だけ残す。"""
    result = []
    for category in categories or []:
        if not isinstance(category, dict):
            continue

        cat_id = str(category.get("id", "")).strip()
        name = str(category.get("category", "")).strip()
        if not cat_id or not name:
            continue

        image = str(category.get("image", "")).strip()
        if image and "/" not in image:
            image = f"images/{image}"

        items = []
        for item in category.get("items", []) or []:
            if not isinstance(item, dict):
                continue
            title = str(item.get("title", "")).strip()
            if not title:
                continue
            items.append({"title": title, "link": str(item.get("link", "")).strip()})

        result.append({
            "id": cat_id,
            "category": name,
            "image": image,
            "desc": str(category.get("desc", "")).strip(),
            "items": items,
        })
    return result


def write_json(path, payload):
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    with open(path, "w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)
        file.write("\n")


def main():
    api_url = os.environ.get("SHEETS_API_URL", "").strip()
    if not api_url:
        print(
            "環境変数 SHEETS_API_URL が設定されていません。"
            "リポジトリの Settings → Secrets に Apps ScriptのウェブアプリURLを登録してください。",
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        data = fetch_data(api_url)
    except urllib.error.HTTPError as err:
        print(f"Apps Script への接続に失敗しました（HTTP {err.code}）", file=sys.stderr)
        sys.exit(1)
    except Exception as err:  # noqa: BLE001
        print(f"データの取得に失敗しました: {err}", file=sys.stderr)
        sys.exit(1)

    for name, output_path in OUTPUTS.items():
        items = clean_items(data.get(name, []))
        write_json(output_path, items)
        print(f"{name}: {len(items)} 件を {output_path} に書き出しました")

    # 目的別情報は、内容が空のときは既存のファイルを残す
    # （シートが未入力のまま反映してもトップページが空にならないようにする）
    purposes = clean_purposes(data.get("purposes", []))
    if purposes:
        write_json(PURPOSES_OUTPUT, purposes)
        total_items = sum(len(category["items"]) for category in purposes)
        print(
            f"purposes: {len(purposes)} カテゴリ / {total_items} 件を "
            f"{PURPOSES_OUTPUT} に書き出しました"
        )
    else:
        print(
            "purposes: スプレッドシートが空だったため "
            f"{PURPOSES_OUTPUT} は更新しませんでした"
        )


if __name__ == "__main__":
    main()
