# タイムスタンプ証明（先行性の証拠）

このディレクトリ配下の主要ファイルは、**OpenTimestamps プロトコル** で Bitcoin ブロックチェーンに先行性の証明を残しています。

「2026年5月時点で Yuki がこの設計を持っていた」が、GitHub / Anthropic / Google などの第三者を介さずに **Bitcoin の中央集権ではない時刻記録** で検証可能になります。

---

## 2026-05-14 第1回スタンプ

**送信時刻**：`docs/analytics/timestamps_manifest.json` の `created_at` フィールド参照

**スタンプ対象**（9ファイル）：

| ファイル | 役割 |
|---|---|
| `CLAUDE.md` | システム全体像（取扱説明書） |
| `docs/analytics/PROMPT.md` | 分析手順・表現ガイドライン（IP価値の核） |
| `docs/analytics/README.md` | 運用マニュアル |
| `docs/analytics/known-issues.md` | コンテンツ更新計画 |
| `scripts/fetch_gsc.py` | OAuth+GSC API 実装 |
| `.github/workflows/weekly-seo-report.yml` | GitHub Actions 自動化 |
| `_config.yml` | プライバシー設定（Jekyll exclude） |
| `docs/analytics/reports/2026-05-14.md` | 初回レポート AI構造化版 |
| `docs/analytics/reports/2026-05-14.html` | 初回レポート 人間用 |

**送信先カレンダー**（3社の独立サーバー）：

- `https://a.pool.opentimestamps.org`
- `https://b.pool.opentimestamps.org`
- `https://a.pool.eternitywall.com`

各カレンダーは1時間以内に集約 → Bitcoin の OP_RETURN にハッシュをコミット。
完了後は Bitcoin ブロックチェーンが消えない限り永続的に検証可能。

---

## 検証方法

### 方法1：ハッシュの直接照合（誰でも可能）

```sh
# ファイルの SHA-256 を計算
sha256sum CLAUDE.md
# → bf66e94c79346a3dd0e67627f00efb3dd89ae3568ac20710b229705b2a8ad39b

# manifest と照合
grep -A1 "CLAUDE.md" docs/analytics/timestamps_manifest.json
# → "sha256": "bf66e94c79346a3dd0e67627f00efb3dd89ae3568ac20710b229705b2a8ad39b"
```

ハッシュが一致 = ファイルは manifest 記録時点から変更されていない。

### 方法2：カレンダーサーバーで存在確認

```sh
# 任意のカレンダーに hash を投げて「いつ受け取ったか」を確認
curl -X POST "https://a.pool.opentimestamps.org/digest" \
  --data-binary @<(echo -n bf66e94c...)
```

### 方法3：標準 OTS クライアントで検証（推奨・Bitcoin 確認後）

```sh
# Linux/Mac で（Windows は OpenSSL 周りでハマるので WSL 推奨）
pip install opentimestamps-client
cd taisyoku
ots upgrade CLAUDE.md.ots          # Bitcoin コミット後の証明に格上げ
ots verify CLAUDE.md.ots           # Bitcoin ブロック番号で検証
```

`.ots` ファイル形式は本リポジトリの初期スタンプでは簡易実装で生成されており、
標準クライアントとの完全互換性は未検証。互換性が必要な場合は標準クライアントで再スタンプ可能。
**ハッシュ自体はカレンダーに正しく送信済**なので、Bitcoin コミットメントは正規ルートで形成中。

---

## 運用ルール

- **新しい主要ファイル**（新規レポート、新スクリプト、新ドキュメント）を作ったら、定期的に追加スタンプ
- スタンプ頻度の目安：月1回、または主要更新時
- スタンプスクリプトは `scripts/timestamps_stamp.py` に格納予定（未実装）

---

## なぜこれをやるのか

- **AI 時代の課題**：誰でもコードが書けるため「先に作った」の主張が難しい
- **GitHub だけでは不十分**：GitHub のコミット時刻は GitHub が信頼性を担保しているが、改竄不可能ではない
- **Bitcoin は信頼を必要としない時刻記録**：誰の言うことも信じる必要がない
- **将来の売却・移転時の根拠**：「いつ作ったか」が改竄不可能に固定される

---

## 関連：CLAUDE.md の長期ビジョン

オーナー Yuki の関心領域に **「Web3 による存在証明の民主化」** がある。
本プロジェクトの timestamping は、その思想を実プロダクトに適用する最初の実例として位置付けられる。
