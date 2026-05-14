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
4. 下記「分析の観点」に従って `docs/analytics/reports/D.md` を新規作成する
5. 既存の `docs/analytics/reports/` 配下に直近4週分くらいのレポートがある場合、傾向の比較もする

---

## 分析の観点

レポートは以下のセクションを順に持つ。**事実→解釈→提案**の順。空セクションは省略してよい。

### 1. サマリ（3行）
- 直近28日の総 impressions / clicks / 平均 position
- 前28日比の増減（% で）
- 一言で言うと（例：「順位は維持。CTRが低いページが3つ。新規クエリ立ち上がり中」）

### 2. 順位が下がったクエリ TOP10
last28 と prev28 を JOIN（query+page）して、position が **+2 以上悪化** した行で impressions が10以上のもの。下記カラム：

`クエリ / ページ / position 前→後 / impressions 前→後 / clicks 前→後`

### 3. CTR が低いページ TOP10
last28_by_page から、impressions ≥ 100 かつ ctr が「サイト全体中央値 × 0.7 未満」のページ。`page / impressions / ctr / position` で並べる。
**改善の方向**を1行で書く（タイトル改善 / メタディスクリプション弱い / 検索意図ずれ 等）。

### 4. 新規に立ち上がったクエリ TOP10
prev28 に存在せず last28 に存在し、impressions ≥ 5 のクエリ。これは「狙わずに伸びた」入り口なので大事。
`クエリ / ページ / impressions / position`。GEO/LLMO 文脈で意図を1行で推測する。

### 5. 既知課題と GSC データの突き合わせ
`known-issues.md` の各項目について、GSC データ上で関連クエリ・ページが該当するかチェック。
例：「給付制限の表記揺れ」→「給付制限 1ヶ月」「給付制限 2ヶ月」「給付制限 3ヶ月」「待機期間」あたりのクエリで position が荒れていれば該当ありとマーク。

### 6. 今週の改善提案（具体行動 3〜5件）
各提案は次の形式：

```
[ ] page: voluntary.html
    課題: 「給付制限 2ヶ月」が前28日 position 4.2 → 直近 7.8 に悪化
    仮説: 2025年改正の正式表記との差。同義語が散らばっている
    対策: H2「給付制限期間」セクションに「給付制限期間（旧称：待機期間2ヶ月）」と
          1度だけ書き、本文の「2ヶ月の待機」表現を「給付制限期間」に統一
    工数: 15分
```

優先度は「impressions が多い × 自分の作業時間が短い」を上位に。

### 7. 次回見るべきこと（任意）
来週注視すべき指標やクエリ。

---

## レポートのトーン

- 主観や根拠不明な断定はしない
- 数字は必ず CSV 由来。推測には「推測：」または「仮説：」と書く
- 絵文字は使わない
- 「やってください」ではなく「やる対象」として淡々と並べる
- 日本語

---

## 動かし方（運用メモ）

Claude Code 側で：

> 今週のレポート作って

これだけで、Claude がこのファイルを読み、上記手順を実行する。
完成したら `git add docs/analytics/reports/ && git commit -m "docs(analytics): weekly report YYYY-MM-DD"` まで提案する（コミットは Yuki が最終承認）。
