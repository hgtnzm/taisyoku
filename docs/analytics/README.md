# shitugyoukyufu.com アナリティクス自動レポート

毎週 GSC データを GitHub Actions で自動収集 → Claude Code で分析、という二段構えの運用。

```
[GitHub Actions: 毎週月曜 7:00 JST]
   └ scripts/fetch_gsc.py が GSC API を叩いて raw/YYYY-MM-DD/*.csv を自動コミット

[Claude Code: 週1回 Yuki が起動して一言]
   └ 「今週のレポート作って」→ PROMPT.md に従い reports/YYYY-MM-DD.md を生成
```

- 完全な自動分析にしないのは、Claude API キー無しで運用するため（コスト & 鍵管理ゼロ）
- 分析を完全自動化したくなったら `weekly-seo-report.yml` に Claude API ステップを追加するだけ

---

## 初回セットアップ（5〜10分・1回だけ）

### ステップ1：Google Cloud でサービスアカウント発行

1. https://console.cloud.google.com/ にアクセス（Yuki の Google アカウントでログイン）
2. 上部「プロジェクトを選択」→「新しいプロジェクト」→ 名前 `taisyoku-analytics` 等 → 作成
3. 左上ハンバーガー → 「APIとサービス」 → 「ライブラリ」
4. `Search Console API` を検索 → 開く → **有効にする**
5. 左メニュー「認証情報」 → 上部「認証情報を作成」 → **サービスアカウント**
6. サービスアカウント名 `gsc-reader` 等 → 作成して続行 → 役割は付与せずスキップ → 完了
7. できたサービスアカウント行をクリック → 上部「キー」タブ → 「鍵を追加」 → **JSON** → ダウンロード
   - ファイル名は何でもよい。中身を後で GitHub Secret に貼る

### ステップ2：Search Console にサービスアカウントを追加

1. https://search.google.com/search-console を開く
2. プロパティ `https://shitugyoukyufu.com/` を選択
3. 左下「設定」 → 「ユーザーと権限」 → 「ユーザーを追加」
4. ステップ1で作ったサービスアカウントのメールアドレス（例 `gsc-reader@taisyoku-analytics.iam.gserviceaccount.com`）を入力
5. 権限：**制限付き** で十分（読み取りだけ）

### ステップ3：GitHub に Secret を登録

1. https://github.com/hgtnzm/taisyoku/settings/secrets/actions
2. 「New repository secret」
3. Name: `GSC_SERVICE_ACCOUNT_JSON`
4. Secret: ステップ1でダウンロードした JSON ファイルの中身を**そのまま全文ペースト**
5. 保存

### ステップ4：手動で1回動かして確認

```sh
gh workflow run "Weekly SEO Report" -R hgtnzm/taisyoku
gh run watch -R hgtnzm/taisyoku
```

成功すると `docs/analytics/raw/YYYY-MM-DD/` に CSV 群がコミットされる。

うまく行かない場合のチェック：
- `403 PERMISSION_DENIED` → ステップ2 でサービスアカウント追加し忘れ
- `400 Bad Request: site` → `GSC_SITE_URL` Variable を `https://shitugyoukyufu.com/` で再確認（末尾スラッシュ必須）
- ドメインプロパティで登録している場合は `sc-domain:shitugyoukyufu.com` を Variable に設定

---

## 週次レポートの作り方

スケジュール起動は勝手に動くので、Yuki がやるのは月曜の朝（or 都合のいい時）に **Claude Code を起動して下記を打つだけ**：

> 今週のレポート作って

Claude Code が `docs/analytics/PROMPT.md` を読んで分析し、`docs/analytics/reports/YYYY-MM-DD.md` を作成して push 提案する。

iPhone で見るときは GitHub アプリ or ブラウザで `docs/analytics/reports/` を開く。

---

## ファイル構成

```
.github/workflows/
  weekly-seo-report.yml      # 週次GSC収集ジョブ
scripts/
  fetch_gsc.py               # GSC API → CSV
  requirements.txt           # google-api-python-client 等
docs/analytics/
  README.md                  # このファイル（運用ドキュメント）
  PROMPT.md                  # Claude Code 分析手順
  known-issues.md            # 既知のコンテンツ課題（人間が更新）
  raw/
    LATEST                   # 最新スナップショットの日付
    YYYY-MM-DD/
      meta.json              # 期間情報
      last28_query_page.csv  # 直近28日 クエリ×ページ
      prev28_query_page.csv  # その前28日
      last28_by_page.csv
      last28_by_query.csv
      last28_by_date.csv
  reports/
    YYYY-MM-DD.md            # 週次レポート AI構造化版
    YYYY-MM-DD.html          # 週次レポート 人間用
```

---

## Telegram 通知

Workflow 実行のたびに Telegram に結果が飛ぶ：

- ✅ 成功：`raw/YYYY-MM-DD/` にデータコミット完了 + Run URL
- ✅ 差分なし：データ反映ラグ等
- ❌ 失敗：Run URL + 「OAuth 失効の可能性」の注意書き

Secrets：`TELEGRAM_BOT_TOKEN`、`TELEGRAM_CHAT_ID`（既存のくろーどBotを流用）

---

## 復旧手順：OAuth refresh_token が失効したとき

Telegram で「❌ GSC週次収集 失敗」が来たら、まずは Run ログを見て `invalid_grant` 系のエラーか確認。
そうなら以下の手順で再発行：

### Step 1：OAuth Playground で再認証

1. https://developers.google.com/oauthplayground にアクセス
2. 右上 ⚙ → 「Use your own OAuth credentials」にチェック
3. Client ID / Client secret は既存の値を入力（`taisyoku-analytics` プロジェクトの `gsc-playground-client`）
4. 左パネル「Input your own scopes」に：`https://www.googleapis.com/auth/webmasters.readonly`
5. **「Authorize APIs」** → `shitugyou.otasuke@gmail.com` でログイン → 許可
6. **「Exchange authorization code for tokens」** ボタン
7. 新しい `refresh_token` をコピー

### Step 2：GitHub Secret を更新

Claude Code で：

> taisyoku の GSC_OAUTH_JSON Secret の refresh_token を更新したい。新しい値は `1//xxx...`

→ Claude が既存の Secret に新しい refresh_token を上書きして `gh secret set` で登録。

### Step 3：Workflow 再実行

```sh
gh workflow run "Weekly SEO Report" -R hgtnzm/taisyoku
```

---

## 拡張アイデア

- **完全自動分析**：Anthropic API キーを Secret に追加 → Workflow に Claude 呼び出しステップを追加。月コスト数十円
- **GA4 統合**：GA4 Data API も同じサービスアカウントで読める。`fetch_ga4.py` を追加して PV / 滞在時間も収集
- **Bing Webmaster API**：Copilot 経由のクエリも取れる
- **Clarity 導入**：ヒートマップ用に `<script>` 1行貼るだけ
- **OAuth アプリ本番昇格**：refresh_token の7日失効を解消（Google verification 申請、sensitive scope なので審査あり・数週間〜数ヶ月）
