# shitugyoukyufu.com アナリティクス自動分析システム

このリポジトリは `shitugyoukyufu.com`（失業給付情報サイト、GitHub Pages）の **本体 + SEO分析自動化システム** が同居している。

---

## このリポジトリの2層構造

### Layer 1：公開サイト本体（shitugyoukyufu.com）
- ルート直下の `*.html`, `*.css`, `*.js`, `images/`, `sitemap.xml`, `robots.txt`, `llms.txt`, `llms-full.txt`, `CNAME`
- 静的 HTML、Jekyll は最小限の exclude のみ使用
- GitHub Pages から自動配信

### Layer 2：SEO分析自動化システム
- `docs/analytics/` … 運用ドキュメント・既知課題・レポート
- `scripts/` … GSC API データ取得スクリプト
- `.github/workflows/` … GitHub Actions（週次自動収集）
- `_config.yml` でこれらは公開サイトから除外。raw.githack.com 経由でのみ閲覧可能

---

## システムの仕組み（要約）

```
[GitHub Actions: 毎週月曜 7:00 JST 自動]
   └─ scripts/fetch_gsc.py が GSC API で直近28日+前28日のデータを取得
       └─ docs/analytics/raw/YYYY-MM-DD/*.csv を自動コミット
       └─ 完了/失敗を Telegram Bot 経由でYukiに通知

[Claude Code: Yuki が「今週のレポート作って」と言う]
   └─ docs/analytics/PROMPT.md の手順に従い
       ├─ docs/analytics/reports/D.md   (AI構造化版・次回Claudeが読む)
       └─ docs/analytics/reports/D.html (人間用・iPhoneでも見やすい)
```

---

## 重要な運用知識

### 週次レポート生成

ユーザーが「**今週のレポート作って**」と言ったら：

1. `docs/analytics/raw/LATEST` を読んで最新スナップショット日付 D を取得
2. `docs/analytics/PROMPT.md` を必読 — 出力フォーマット・表現ガイドラインが詳細に書かれている
3. `docs/analytics/known-issues.md` を読んでコンテンツ更新計画を把握
4. `docs/analytics/raw/D/` の CSV5枚 + meta.json を分析
5. **必ず2ファイル生成**：`reports/D.md`（AI構造化）+ `reports/D.html`（人間用）
6. **`reports/latest.html` の3箇所を D に差し替え**（meta refresh URL / 本文「YYYY-MM-DD」/ `<a href>`）
7. コミット提案 → Yuki承認 → push

### 改善対応後のフロー

サイト本体（`calculator.html` 等）を直したら、対応する項目を `docs/analytics/known-issues.md` から削除する。次のレポート生成時に「直った」と認識される。

### 失敗通知が来たら

Telegram で「❌ GSC週次収集 失敗」を受信したら：
- `docs/analytics/README.md` の **「OAuth 状態と復旧手順」** セクションを参照
- 大抵は OAuth Playground で refresh_token を再発行 → `gh secret set GSC_OAUTH_JSON` で更新

### iPhone 閲覧URL

**最新版（自動で最新レポートに転送、ブックマーク推奨）：**
```
https://raw.githack.com/hgtnzm/taisyoku/main/docs/analytics/reports/latest.html
```

**日付指定版（特定週を見たいとき）：**
```
https://raw.githack.com/hgtnzm/taisyoku/main/docs/analytics/reports/YYYY-MM-DD.html
```

`latest.html` は meta refresh で最新の `YYYY-MM-DD.html` に飛ばす雛形。レポート生成時に PROMPT.md の手順6に従って3箇所（meta refresh URL / 本文タイトル / `<a href>`）を新しい日付に差し替える運用。

---

## 認証・課金状態

| 項目 | 状態 |
|---|---|
| Google OAuth アプリ公開ステータス | **本番環境**（テスト中ではない、refresh_token無期限） |
| GSC 認証方式 | OAuth user credentials（Yuki本人アカウント `shitugyou.otasuke@gmail.com`） |
| サービスアカウント | `shitugyoukyufu@taisyoku-analytics.iam.gserviceaccount.com`（GSC UIが拒否したため未使用、GA4で再利用想定で温存） |
| Anthropic API キー | **使用していない**（Claude Code サブスク内で完結） |
| Google Cloud 課金 | 無料枠内（GSC API 無料） |
| GitHub Actions | 無料（public repo は無制限） |
| Telegram Bot | 既存「くろーどBot」流用 |

GitHub Secrets：
- `GSC_OAUTH_JSON` … OAuth refresh_token 一式
- `GSC_SERVICE_ACCOUNT_JSON` … SA JSON（GA4用に温存）
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` … 通知用

GitHub Variables：
- `GSC_SITE_URL` … `https://shitugyoukyufu.com/`（URLプレフィックスプロパティ使用、ドメインプロパティはデータ未蓄積のため不使用）

---

## 重要な参照ドキュメント

| ファイル | 用途 |
|---|---|
| `docs/analytics/README.md` | 運用マニュアル全体・復旧手順・拡張アイデア |
| `docs/analytics/PROMPT.md` | レポート生成の詳細手順・表現ガイドライン |
| `docs/analytics/known-issues.md` | コンテンツ更新計画（人間が手動更新） |
| `.github/workflows/weekly-seo-report.yml` | GitHub Actions 週次ジョブ定義 |
| `scripts/fetch_gsc.py` | GSC API → CSV のスクリプト |
| `_config.yml` | Jekyll exclude（docs/scripts/.github をサイトから除外） |

---

## 表現ガイドライン（重要）

レポートと `known-issues.md` は万一公開状態になっても角が立たないよう、**自己否定表現を避ける**：

- ❌ 「誤り」「不正確」「古い」「不十分」「弱い」「失敗している」
- ✅ 「最新化対象」「アップデート計画」「2025年版に拡充」「強化余地あり」「改善機会」

数字の事実（CTR 0.10% 等）は淡々と書いてOK。価値判断のみ中立化する。

---

## 拡張余地（未実装）

- **GA4 連携**：滞在時間と GSC データを JOIN（フェーズ2、`fetch_ga4.py` を追加）
- **完全自動分析**：Anthropic API キーを追加すれば Yuki介入ゼロ化（月数十円）
- **Clarity 導入**：ヒートマップ用に `<script>` 1行追加
- **Bing Webmaster API**：Copilot 経由クエリ取得
