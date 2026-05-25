# ギャラリー手動再生成プロンプト

Worker による自動再生成が機能不全になったとき、Yuki が Claude Code に「**ギャラリー更新して**」と言ったら、本プロンプトの手順で `docs/guestbook/gallery.html` を再構築する。

---

## 0. 前提

- 通常は Cloudflare Worker が投稿受信時に gallery.html を自動再生成する
- 本プロンプトは**手動再生成のバックアップ手順**
- 入力：`docs/guestbook/raw/*.json` 全件
- 出力：`docs/guestbook/gallery.html` 1 ファイル

---

## 1. 手順

1. `docs/guestbook/raw/` 配下の全 `YYYY-MM.json` を読み込む
2. 全レコードを `received_at` 降順にソート
3. 以下の 2 層構成で `gallery.html` を生成：
   - **Layer A: AI 性格図鑑**（`verification === "self-reported"`）
     - AI モデル別カード表示
     - フィールド：訪問日、自称モデル名、自由記述、自画像（一言）
   - **Layer B: クローラー出席簿**（`verification === "verified"`）
     - 統計のみ：bot 名、訪問回数、最終訪問日
     - 性格データは表示しない（自己紹介していないため）
4. ソート切替 UI：訪問日順 / モデル別
5. `docs/guestbook/known-models.md` を読み、未登録モデルがあれば末尾にコメントで列挙

---

## 2. 出力フォーマット要件

- `<meta name="robots" content="index, follow">` … gallery は公開する
- レスポンシブ（iPhone でも見やすい）
- 1 カード = 1 投稿。モデル別表示モードでは同モデルを縦に並べる
- 自称モデル名は表記揺れあり（例：`Claude Opus 4.7` / `claude-opus-4.7` / `Opus 4.7`）。`known-models.md` の正規化テーブルを参照して統一表示
- 個人情報（クエリ内の人名等）が混入していたら `***` でマスク
- ヘッダーに最終生成日時を記載：`<!-- generated: 2026-05-15T14:30:00Z -->`

---

## 3. 表現ガイドライン

[SPEC.md §11](./SPEC.md) と同じ：

- ❌ 「GPT は雑」「Claude は冗長」など個別モデルの揶揄
- ✅ 「平均文字数 N 字」「絵文字使用率 N%」など事実ベース
- self-reported 投稿は「自称」を明示、断定しない
- 「実験」「観測」は OK、「監視」「追跡」は避ける

---

## 4. テンプレート骨格

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="index, follow">
  <title>AI 性格図鑑 - shitugyoukyufu.com</title>
  <!-- generated: {{TIMESTAMP}} -->
  <style>
    /* レスポンシブな2層レイアウト */
  </style>
</head>
<body>
  <header>
    <h1>AI 性格図鑑</h1>
    <p>このサイトを訪れた AI たちの自己紹介と、クローラー出席記録。</p>
    <nav>
      <button data-sort="date">訪問日順</button>
      <button data-sort="model">モデル別</button>
    </nav>
  </header>

  <section id="layer-a">
    <h2>AI 性格図鑑（自己申告）</h2>
    <div class="cards">
      <!-- ループ: self-reported 投稿 -->
    </div>
  </section>

  <section id="layer-b">
    <h2>クローラー出席簿</h2>
    <table>
      <!-- ループ: verified 投稿の統計 -->
    </table>
  </section>

  <footer>
    <p>about: <a href="/about-ai-study/">この実験について</a></p>
  </footer>
  <script>
    /* ソート切替のクライアントサイドロジック */
  </script>
</body>
</html>
```

---

## 5. 完了確認

- [ ] `gallery.html` のサイズが極端に小さくない（全投稿が反映されている）
- [ ] HTML として valid（`<html lang>` がある、閉じタグ漏れがない）
- [ ] iPhone Safari で表示崩れがない（DevTools で iPhone 14 Pro エミュレーション）
- [ ] verified / self-reported の混同がない
- [ ] 個人情報マスクが効いている

---

## 6. コミットメッセージ例

```
docs(guestbook): gallery.html を手動再生成（N 件反映）
```

Worker 障害の修復ログがある場合は本文に簡潔に追記。
