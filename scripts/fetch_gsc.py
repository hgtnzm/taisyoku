"""Search Console から直近2期間の検索パフォーマンスを取得し CSV に保存する。

GitHub Actions から週次で実行される。Claude API は呼ばない。
収集だけして docs/analytics/raw/YYYY-MM-DD/ にコミットする運用。
分析は Claude Code 側で PROMPT.md に従って手動実行する（案C）。

Env:
  GSC_SERVICE_ACCOUNT_JSON  サービスアカウントの JSON 文字列
  GSC_SITE_URL              例: "https://shitugyoukyufu.com/" or "sc-domain:shitugyoukyufu.com"
  OUTPUT_DIR                出力ディレクトリ（既定: docs/analytics/raw）
"""

from __future__ import annotations

import csv
import json
import os
import sys
from datetime import date, timedelta
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"]
ROW_LIMIT = 25000  # GSC API の1リクエスト最大


def build_service():
    raw = os.environ.get("GSC_SERVICE_ACCOUNT_JSON")
    if not raw:
        sys.exit("GSC_SERVICE_ACCOUNT_JSON is not set")
    info = json.loads(raw)
    creds = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    return build("searchconsole", "v1", credentials=creds, cache_discovery=False)


def fetch(service, site_url: str, start: date, end: date, dimensions: list[str]):
    """Search Analytics API を叩いて全行返す。"""
    rows: list[dict] = []
    start_row = 0
    while True:
        resp = service.searchanalytics().query(
            siteUrl=site_url,
            body={
                "startDate": start.isoformat(),
                "endDate": end.isoformat(),
                "dimensions": dimensions,
                "rowLimit": ROW_LIMIT,
                "startRow": start_row,
                "dataState": "final",
            },
        ).execute()
        batch = resp.get("rows", [])
        rows.extend(batch)
        if len(batch) < ROW_LIMIT:
            break
        start_row += ROW_LIMIT
    return rows


def write_csv(path: Path, rows: list[dict], dimensions: list[str]):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow([*dimensions, "clicks", "impressions", "ctr", "position"])
        for r in rows:
            keys = r.get("keys", [])
            w.writerow([
                *keys,
                r.get("clicks", 0),
                r.get("impressions", 0),
                round(r.get("ctr", 0.0), 6),
                round(r.get("position", 0.0), 3),
            ])


def main():
    site_url = os.environ.get("GSC_SITE_URL", "https://shitugyoukyufu.com/")
    out_dir = Path(os.environ.get("OUTPUT_DIR", "docs/analytics/raw"))

    today = date.today()
    last28_end = today - timedelta(days=3)        # GSC は2日程度のタイムラグがあるので3日前で締める
    last28_start = last28_end - timedelta(days=27)
    prev28_end = last28_start - timedelta(days=1)
    prev28_start = prev28_end - timedelta(days=27)

    target_dir = out_dir / today.isoformat()
    print(f"site={site_url}")
    print(f"last28 = {last28_start} .. {last28_end}")
    print(f"prev28 = {prev28_start} .. {prev28_end}")
    print(f"out    = {target_dir}")

    service = build_service()

    jobs = [
        ("last28_query_page.csv", last28_start, last28_end, ["query", "page"]),
        ("prev28_query_page.csv", prev28_start, prev28_end, ["query", "page"]),
        ("last28_by_page.csv",    last28_start, last28_end, ["page"]),
        ("last28_by_query.csv",   last28_start, last28_end, ["query"]),
        ("last28_by_date.csv",    last28_start, last28_end, ["date"]),
    ]
    for filename, s, e, dims in jobs:
        rows = fetch(service, site_url, s, e, dims)
        write_csv(target_dir / filename, rows, dims)
        print(f"  {filename}: {len(rows)} rows")

    # 期間情報をメタとして保存
    meta = {
        "generated_at": today.isoformat(),
        "site_url": site_url,
        "last28": {"start": last28_start.isoformat(), "end": last28_end.isoformat()},
        "prev28": {"start": prev28_start.isoformat(), "end": prev28_end.isoformat()},
    }
    (target_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    # 「最新」ポインタ
    (out_dir / "LATEST").write_text(today.isoformat() + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
