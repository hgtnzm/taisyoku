# Claude Code 分析プロンプト

このファイルは「今週のレポート作って」と Claude Code に頼んだとき、Claude が読み込んで分析するための指示書。
最新の生データは `docs/analytics/raw/LATEST` が指す日付フォルダにある。

---

## あなた（Claude Code）の手順

1. `docs/analytics/raw/LATEST` を読み、最新スナップショットの日付 D を取得する
2. `docs/analytics/raw/D/` 配下の CSV と `meta.json` を読む
   - `last28_query_page.csv` 直近28日 のクエリ×ページ
   - `prev28_query_page.csv` その前の28日
   - `last28_by_page.csv` 直近28日 のページ別
   - `last28_by_query.csv` 直近28日 のクエリ別
   - `last28_by_date.csv` 直近28日 の日次推移
3. `docs/analytics/known-issues.md` を読む
4. 既存の `docs/analytics/reports/` 配下の過去レポート（最新4週分くらい）にも目を通し、傾向比較する
5. **2つのファイルを必ず両方生成する**：
   - `docs/analytics/reports/D.md` … **AI構造化版**（次回の Claude が読む。人間に配慮しない）
   - `docs/analytics/reports/D.html` … **人間用**（iPhone/PC で見やすい HTML）

両方とも生成する。片方だけで終わってはいけない。

---

## AI構造化版（D.md）の仕様

**読み手は次回の Claude**。可能な限り構造化し、自然言語の冗長な解説は最小化する。

### 必須セクション

```yaml
---
schema_version: 1
report_date: <D>
data_source: gsc_url_prefix  # or sc_domain
site: https://shitugyoukyufu.com/
data_period:
  last28: {start: <YYYY-MM-DD>, end: <YYYY-MM-DD>}
  prev28: {start: <YYYY-MM-DD>, end: <YYYY-MM-DD>}
totals_last28:
  clicks: <int>
  impressions: <int>
  ctr: <float>
  pages_with_data: <int>
  queries_with_data: <int>
totals_prev28_query_page_lower_bound:
  clicks: <int>
  impressions: <int>
  note: query×pageでの下限値
ctr_baseline:
  site_median_imp_ge_50: <float>
  threshold_low: <float>
---

# Report <D>

## section: position_drops
<criteria YAML block>
<table: query | page | pos_prev | pos_last | delta_pos | imp_prev | imp_last | cli_prev | cli_last>
<note行で補足: 例 mover_idでの解釈>

## section: new_queries
<criteria YAML block>
<table: query | page | imp | clicks | pos>
<cluster: ... で群を示す>

## section: low_ctr_pages
<criteria YAML block>
<table: page | imp | ctr | pos | priority | hypothesis>
hypothesis 値の語彙: ai_overview_absorption / low_rank_natural_ctr_loss / title_mismatch / etc

## section: top_pages_by_clicks
<table: page | clicks | imp | ctr | pos>

## section: known_issues_correlation
<table: issue_id | issue | verdict | evidence>
verdict 語彙: matched_high_priority / matched_indirect / no_evidence / no_exposure

## section: recommendations
<YAML list>:
  - id: REC-NNN
    page: <path>
    priority: high|medium|low
    problem: <factual statement with numbers>
    hypothesis: <snake_case_tag>
    evidence_queries: [<{q, imp, pos, clicks}, ...>]
    related_known_issue: <KI-N or null>
    actions: [<list>]
    estimated_minutes: [<min>, <max>]
    expected_clicks_delta_per_month: <int or "unknown">

## section: next_review_focus
<bullet list>

## meta
<YAML: generated_at, generator, data_files, known_issues_file>
```

### スタイル指針

- 数値は必ず CSV 由来。推測は `hypothesis:` フィールドに分離
- 自然言語のセクションタイトルは付けない（`section: position_drops` のような id 形式）
- 絵文字は使わない
- 表記揺れを作らない（`pos` / `position` の混在禁止、片方に統一）
- 「やってください」のような呼びかけは入れない
- 改善案は YAML リスト形式で機械可読

---

## 人間用（D.html）の仕様

**読み手はYuki本人（iPhone & PC）**。視覚的に把握しやすく、行動に移しやすい。

### 必須要素

- `<meta name="robots" content="noindex,nofollow">` を入れる（インデックスさせない）
- viewport mobile 対応
- ヘッダー: タイトル + 期間
- サマリーボックス: clicks / impressions / CTR / クエリ数 を大きな数字で
  - 前28日比の delta（増減）を up/down 色付きで
- セクション順:
  1. 順位が下がったクエリ（テーブル）
  2. CTR が低いページ（テーブル + priority バッジ）
  3. 新規に立ち上がったクエリ（テーブル）
  4. 既知課題との突き合わせ（テーブル + verdict バッジ）
  5. 今週の改善提案（カード形式、priority で色分け）
  6. 次回見るべきこと（箇条書き）
- カラースキーム:
  - critical/high = 赤系（`#dc2626`）
  - medium/warn = 黄系（`#d97706`）
  - ok/up = 緑系（`#059669`）
  - low/muted = 灰系
- CSS は `<style>` でインライン（外部ファイル禁止、自己完結）
- JS は使わない

### 既存テンプレを再利用すること

`docs/analytics/reports/2026-05-14.html` を雛形として使う。
構造は固定し、中身の値だけ差し替える運用。

---

## 出力時の最後の手順

1. `D.md` と `D.html` の両方を `docs/analytics/reports/` に書いた
2. `git add docs/analytics/reports/ && git commit -m "docs(analytics): 週次レポート D を生成"` の提案
3. push は Yuki が承認してから

---

## レポートの一般原則

- 主観や根拠不明な断定はしない
- 数字は必ず CSV 由来
- 推測には `hypothesis` フィールドや「仮説：」と明記
- 「やってください」ではなく「やる対象」として淡々と並べる
- 日本語

---

## 動かし方（運用メモ）

Claude Code 側で：

> 今週のレポート作って

これで、Claude がこのファイルを読み、上記手順を実行する（.md + .html の両方を生成）。
