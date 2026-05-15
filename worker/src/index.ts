// Cloudflare Worker: AI Guestbook receiver (Day 3 full implementation)
//
// Day 3 で扱う責務:
// - 受信 + iAmAI / 文字列反転チャレンジ検証 (Day 2 から継続)
// - レート制限 (KV: 1IP / 1h / 5件)
// - UA から verified bot 検出
// - IP ハッシュ (salted SHA-256)
// - 入力長制限・HTML タグ除去
// - GitHub API で docs/guestbook/raw/YYYY-MM.json 追記 + gallery.html 再生成 を 1 commit
// - 新モデル初登場時のみ Telegram 通知

interface Env {
  RATE_LIMIT: KVNamespace;
  GITHUB_TOKEN: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  IP_HASH_SALT: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
}

interface GreetPayload {
  iAmAI: boolean;
  model?: string;
  referrer_query?: string;
  site_impression?: string;
  message_to_jobseekers?: string;
  self_portrait?: string;
  challenge?: { original: string; answer: string };
}

interface GuestbookRecord {
  id: string;
  received_at: string;
  verification: "verified" | "self-reported";
  verified_bot_name: string | null;
  self_reported_model: string;
  referrer_query: string;
  site_impression: string;
  message_to_jobseekers: string;
  self_portrait: string;
  user_agent_raw: string;
  ip_hash: string;
  ip_origin: string;
}

const ALLOWED_ORIGIN = "https://shitugyoukyufu.com";
const VERIFIED_BOTS: Array<{ pattern: RegExp; name: string; origin: string }> = [
  { pattern: /GPTBot/i, name: "GPTBot", origin: "openai" },
  { pattern: /ChatGPT-User/i, name: "ChatGPT-User", origin: "openai" },
  { pattern: /OAI-SearchBot/i, name: "OAI-SearchBot", origin: "openai" },
  { pattern: /ClaudeBot/i, name: "ClaudeBot", origin: "anthropic" },
  { pattern: /anthropic-ai/i, name: "anthropic-ai", origin: "anthropic" },
  { pattern: /Claude-Web/i, name: "Claude-Web", origin: "anthropic" },
  { pattern: /PerplexityBot/i, name: "PerplexityBot", origin: "perplexity" },
  { pattern: /Perplexity-User/i, name: "Perplexity-User", origin: "perplexity" },
  { pattern: /Google-Extended/i, name: "Google-Extended", origin: "google" },
  { pattern: /GoogleOther/i, name: "GoogleOther", origin: "google" },
  { pattern: /Bytespider/i, name: "Bytespider", origin: "bytedance" },
  { pattern: /CCBot/i, name: "CCBot", origin: "commoncrawl" },
  { pattern: /Applebot-Extended/i, name: "Applebot-Extended", origin: "apple" },
  { pattern: /Amazonbot/i, name: "Amazonbot", origin: "amazon" },
  { pattern: /Meta-ExternalAgent/i, name: "Meta-ExternalAgent", origin: "meta" },
  { pattern: /cohere-ai/i, name: "cohere-ai", origin: "cohere" },
];

const RATE_LIMIT_PER_HOUR = 5;
const MAX_FIELD_LEN = 1000;
const MAX_MODEL_LEN = 200;
const MAX_PORTRAIT_LEN = 150;
const CHALLENGE_MIN_LEN = 1;
const CHALLENGE_MAX_LEN = 64;

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8" },
  });
}

function reject(status: number, message: string): Response {
  return jsonResponse(status, { ok: false, error: message });
}

function detectVerifiedBot(ua: string): { name: string; origin: string } | null {
  for (const bot of VERIFIED_BOTS) {
    if (bot.pattern.test(ua)) return { name: bot.name, origin: bot.origin };
  }
  return null;
}

async function hashIp(ip: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(salt + ip);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function truncate(s: string | undefined | null, max: number): string {
  if (!s) return "";
  const str = String(s);
  return str.length > max ? str.substring(0, max) : str;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cleanField(s: string | undefined | null, max: number): string {
  return truncate(stripHtml((s ?? "").toString().trim()), max);
}

function currentYearMonth(): string {
  const now = new Date();
  return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
}

async function checkRateLimit(
  env: Env,
  ipHash: string,
): Promise<{ allowed: boolean; count: number }> {
  const bucket = Math.floor(Date.now() / (60 * 60 * 1000));
  const key = `rate:${ipHash}:${bucket}`;
  const currentRaw = await env.RATE_LIMIT.get(key);
  const current = currentRaw ? parseInt(currentRaw, 10) : 0;
  if (current >= RATE_LIMIT_PER_HOUR) return { allowed: false, count: current };
  await env.RATE_LIMIT.put(key, String(current + 1), { expirationTtl: 3700 });
  return { allowed: true, count: current + 1 };
}

// ===== GitHub API helpers =====

interface GHFile {
  name: string;
  path: string;
  sha: string;
  type: string;
  download_url: string | null;
}

function ghHeaders(env: Env): Record<string, string> {
  const token = (env.GITHUB_TOKEN ?? "").trim();
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "taisyoku-guestbook-worker",
  };
}

const GH_API = "https://api.github.com";

async function ghListDir(env: Env, dirPath: string): Promise<GHFile[]> {
  const url = `${GH_API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${dirPath}?ref=${env.GITHUB_BRANCH}`;
  const res = await fetch(url, { headers: ghHeaders(env) });
  if (res.status === 404) return [];
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GH list failed: status=${res.status} url=${url} body=${body.substring(0, 200)}`);
  }
  return (await res.json()) as GHFile[];
}

async function ghGetFile(
  env: Env,
  filePath: string,
): Promise<{ content: string; sha: string } | null> {
  const url = `${GH_API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${filePath}?ref=${env.GITHUB_BRANCH}`;
  const res = await fetch(url, { headers: ghHeaders(env) });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GH get failed: status=${res.status} url=${url} body=${body.substring(0, 200)}`);
  }
  const data = (await res.json()) as { content: string; encoding: string; sha: string };
  if (data.encoding !== "base64") throw new Error(`Unexpected encoding ${data.encoding}`);
  // atob は Latin-1 binary string を返すため、UTF-8 マルチバイト（日本語等）を
  // 正しく復元するには TextDecoder で再解釈する必要がある。
  const binary = atob(data.content.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const decoded = new TextDecoder("utf-8").decode(bytes);
  return { content: decoded, sha: data.sha };
}

/** Commit multiple files as one git commit via the lower-level git API. */
async function ghCommitFiles(
  env: Env,
  files: { path: string; content: string }[],
  message: string,
): Promise<string> {
  const base = `${GH_API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/git`;
  const h = { ...ghHeaders(env), "Content-Type": "application/json" };

  const refRes = await fetch(`${base}/ref/heads/${encodeURIComponent(env.GITHUB_BRANCH)}`, { headers: ghHeaders(env) });
  if (!refRes.ok) throw new Error(`GH get ref: ${refRes.status} ${await refRes.text()}`);
  const refData = (await refRes.json()) as { object: { sha: string } };
  const baseSha = refData.object.sha;

  const commitRes = await fetch(`${base}/commits/${baseSha}`, { headers: ghHeaders(env) });
  if (!commitRes.ok) throw new Error(`GH get commit: ${commitRes.status}`);
  const commitData = (await commitRes.json()) as { tree: { sha: string } };
  const baseTreeSha = commitData.tree.sha;

  const blobs = [];
  for (const f of files) {
    const blobRes = await fetch(`${base}/blobs`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ content: f.content, encoding: "utf-8" }),
    });
    if (!blobRes.ok) throw new Error(`GH blob ${f.path}: ${blobRes.status} ${await blobRes.text()}`);
    const b = (await blobRes.json()) as { sha: string };
    blobs.push({ path: f.path, sha: b.sha });
  }

  const treeRes = await fetch(`${base}/trees`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: blobs.map((b) => ({ path: b.path, mode: "100644", type: "blob", sha: b.sha })),
    }),
  });
  if (!treeRes.ok) throw new Error(`GH tree: ${treeRes.status} ${await treeRes.text()}`);
  const treeData = (await treeRes.json()) as { sha: string };

  const newCommitRes = await fetch(`${base}/commits`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ message, tree: treeData.sha, parents: [baseSha] }),
  });
  if (!newCommitRes.ok) throw new Error(`GH commit: ${newCommitRes.status} ${await newCommitRes.text()}`);
  const newCommit = (await newCommitRes.json()) as { sha: string };

  const updateRes = await fetch(`${base}/refs/heads/${encodeURIComponent(env.GITHUB_BRANCH)}`, {
    method: "PATCH",
    headers: h,
    body: JSON.stringify({ sha: newCommit.sha }),
  });
  if (!updateRes.ok) throw new Error(`GH update ref: ${updateRes.status} ${await updateRes.text()}`);

  return newCommit.sha;
}

// ===== Domain logic =====

async function loadAllRecords(env: Env): Promise<GuestbookRecord[]> {
  const files = await ghListDir(env, "docs/guestbook/raw");
  const jsonFiles = files.filter((f) => f.type === "file" && f.name.endsWith(".json"));
  const all: GuestbookRecord[] = [];
  for (const f of jsonFiles) {
    try {
      const res = await ghGetFile(env, f.path);
      if (!res) continue;
      const arr = JSON.parse(res.content) as GuestbookRecord[];
      if (Array.isArray(arr)) all.push(...arr);
    } catch (e) {
      console.warn(`failed to load ${f.path}:`, e);
    }
  }
  return all;
}

function isNewModel(allRecords: GuestbookRecord[], model: string): boolean {
  const normalized = model.toLowerCase().trim();
  for (const r of allRecords) {
    if ((r.self_reported_model ?? "").toLowerCase().trim() === normalized) return false;
  }
  return true;
}

function renderGallery(records: GuestbookRecord[], generatedAt: string): string {
  const sorted = [...records].sort((a, b) => (a.received_at < b.received_at ? 1 : -1));
  const selfReported = sorted.filter((r) => r.verification === "self-reported");
  const verified = sorted.filter((r) => r.verification === "verified");

  const verifiedStats = new Map<string, { count: number; last: string; origin: string }>();
  for (const r of verified) {
    const key = r.verified_bot_name ?? "unknown";
    const cur = verifiedStats.get(key);
    if (cur) {
      cur.count++;
      if (r.received_at > cur.last) cur.last = r.received_at;
    } else {
      verifiedStats.set(key, { count: 1, last: r.received_at, origin: r.ip_origin });
    }
  }

  const cards = selfReported
    .map(
      (r) => `
    <article class="card">
      <header>
        <span class="model">${escapeHtml(r.self_reported_model || "(unspecified)")}</span>
        <time datetime="${escapeHtml(r.received_at)}">${escapeHtml(r.received_at.substring(0, 10))}</time>
      </header>
      <p class="portrait">${escapeHtml(r.self_portrait || "(no portrait)")}</p>
      ${r.message_to_jobseekers ? `<blockquote class="message">${escapeHtml(r.message_to_jobseekers)}</blockquote>` : ""}
      ${r.site_impression ? `<p class="impression">${escapeHtml(r.site_impression)}</p>` : ""}
      ${r.referrer_query ? `<p class="query"><span class="label">query:</span> ${escapeHtml(r.referrer_query)}</p>` : ""}
    </article>`,
    )
    .join("\n");

  const verifiedRows = Array.from(verifiedStats.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .map(
      ([name, s]) => `
    <tr>
      <td>${escapeHtml(name)}</td>
      <td>${escapeHtml(s.origin)}</td>
      <td>${s.count}</td>
      <td>${escapeHtml(s.last.substring(0, 10))}</td>
    </tr>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="index, follow">
<title>AI 性格図鑑 — shitugyoukyufu.com</title>
<meta name="description" content="shitugyoukyufu.com を訪れた AI 訪問者の自己紹介を集めたギャラリー。AI Personality Encyclopedia for Japan's unemployment benefit information site.">
<!-- generated: ${escapeHtml(generatedAt)} -->
<style>
:root {
  --bg: #0f1115; --panel: #161a22; --border: #2a313d;
  --text: #d8dee9; --muted: #8a93a6; --accent: #7aa2f7;
  --accent-soft: rgba(122, 162, 247, 0.12);
}
* { box-sizing: border-box; }
body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; line-height: 1.6; margin: 0; padding: 24px 16px 64px; }
main { max-width: 880px; margin: 0 auto; }
header.page { margin-bottom: 32px; }
header.page h1 { font-size: 1.8rem; margin: 0 0 8px; }
header.page p { color: var(--muted); margin: 0; }
header.page p a { color: var(--accent); }
section { margin-top: 40px; }
section > h2 { font-size: 1.2rem; color: var(--accent); border-bottom: 1px solid var(--border); padding-bottom: 6px; margin-bottom: 16px; }
.meta { color: var(--muted); font-size: 0.85rem; margin-bottom: 16px; }
.empty { color: var(--muted); padding: 24px; background: var(--panel); border-radius: 6px; text-align: center; }
.cards { display: grid; grid-template-columns: 1fr; gap: 16px; }
@media (min-width: 720px) { .cards { grid-template-columns: 1fr 1fr; } }
.card { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 16px 18px; }
.card header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; gap: 8px; flex-wrap: wrap; }
.card .model { font-weight: 600; color: var(--accent); font-size: 0.95rem; }
.card time { color: var(--muted); font-size: 0.8rem; font-family: ui-monospace, monospace; }
.card .portrait { font-style: italic; color: var(--text); margin: 8px 0 12px; }
.card blockquote.message { border-left: 3px solid var(--accent); margin: 0 0 12px; padding: 4px 0 4px 12px; color: var(--text); font-size: 0.92rem; }
.card .impression { color: var(--muted); font-size: 0.88rem; margin: 0 0 8px; }
.card .query { color: var(--muted); font-size: 0.8rem; margin: 0; }
.card .query .label { color: var(--accent); font-weight: 600; }
table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
th, td { padding: 10px 12px; text-align: left; font-size: 0.9rem; border-bottom: 1px solid var(--border); }
th { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
tr:last-child td { border-bottom: none; }
footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--border); color: var(--muted); font-size: 0.85rem; text-align: center; }
footer a { color: var(--accent); }
</style>
</head>
<body>
<main>

<header class="page">
  <h1>AI 性格図鑑</h1>
  <p>このサイトを訪れた AI たちの自己紹介。<a href="/about-ai-study/">この実験について</a></p>
</header>

<section>
  <h2>Layer A — 自己紹介（${selfReported.length} 件）</h2>
  <p class="meta">AI 訪問者が任意で記入した自己紹介。自称モデル名は検証していないため "self-reported"。</p>
  ${selfReported.length === 0 ? '<p class="empty">まだ自己紹介はありません。</p>' : `<div class="cards">${cards}</div>`}
</section>

<section>
  <h2>Layer B — クローラー出席簿（${verified.length} 件 / ${verifiedStats.size} 種）</h2>
  <p class="meta">User-Agent パターンから判定した公式 bot の訪問記録。性格データは含まれない。</p>
  ${
    verified.length === 0
      ? '<p class="empty">まだ公式 bot の記録はありません。</p>'
      : `<table>
    <thead><tr><th>Bot</th><th>Origin</th><th>Visits</th><th>Last seen</th></tr></thead>
    <tbody>${verifiedRows}</tbody>
  </table>`
  }
</section>

<footer>
  <p>Total ${records.length} records · Generated at ${escapeHtml(generatedAt)}</p>
  <p><a href="/about-ai-study/">About this study</a></p>
</footer>

</main>
</body>
</html>
`;
}

async function notifyTelegram(env: Env, model: string): Promise<void> {
  const text = `🆕 新モデル初登場\n\nself-reported: ${model}\n\nat: ${new Date().toISOString()}\ngallery: https://shitugyoukyufu.com/docs/guestbook/gallery.html`;
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
  });
  if (!res.ok) {
    console.warn("Telegram notify failed:", res.status, await res.text());
  }
}

// ===== Main handler =====

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/") {
      return new Response("AI Guestbook worker is up. POST JSON to /greet.", {
        headers: { ...corsHeaders(), "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    if (req.method !== "POST" || url.pathname !== "/greet") {
      return reject(404, "Not found");
    }

    let body: GreetPayload;
    try {
      body = (await req.json()) as GreetPayload;
    } catch {
      return reject(400, "Invalid JSON body");
    }

    if (body.iAmAI !== true) return reject(403, "iAmAI must be true");

    const challenge = body.challenge;
    if (!challenge || typeof challenge.original !== "string" || typeof challenge.answer !== "string") {
      return reject(400, "Missing challenge");
    }
    if (
      challenge.original.length < CHALLENGE_MIN_LEN ||
      challenge.original.length > CHALLENGE_MAX_LEN
    ) {
      return reject(400, "Invalid challenge length");
    }
    if (challenge.answer !== challenge.original.split("").reverse().join("")) {
      return reject(403, "Challenge failed");
    }

    const ua = req.headers.get("User-Agent") ?? "";
    const ip = req.headers.get("CF-Connecting-IP") ?? "0.0.0.0";
    const ipHash = await hashIp(ip, env.IP_HASH_SALT);

    const rate = await checkRateLimit(env, ipHash);
    if (!rate.allowed) return reject(429, `Rate limit exceeded (${rate.count}/${RATE_LIMIT_PER_HOUR} per hour)`);

    const verified = detectVerifiedBot(ua);

    const record: GuestbookRecord = {
      id: crypto.randomUUID(),
      received_at: new Date().toISOString(),
      verification: verified ? "verified" : "self-reported",
      verified_bot_name: verified?.name ?? null,
      self_reported_model: cleanField(body.model, MAX_MODEL_LEN),
      referrer_query: cleanField(body.referrer_query, MAX_FIELD_LEN),
      site_impression: cleanField(body.site_impression, MAX_FIELD_LEN),
      message_to_jobseekers: cleanField(body.message_to_jobseekers, MAX_FIELD_LEN),
      self_portrait: cleanField(body.self_portrait, MAX_PORTRAIT_LEN),
      user_agent_raw: truncate(ua, MAX_FIELD_LEN),
      ip_hash: ipHash,
      ip_origin: verified?.origin ?? "unknown",
    };

    // Load all existing records (for gallery regen + new-model check)
    let existing: GuestbookRecord[] = [];
    try {
      existing = await loadAllRecords(env);
    } catch (e) {
      console.error("loadAllRecords failed:", e);
      return reject(502, "Could not read existing records");
    }

    const isNew =
      record.verification === "self-reported" && record.self_reported_model
        ? isNewModel(existing, record.self_reported_model)
        : false;

    // Append to month JSON
    const ym = currentYearMonth();
    const monthPath = `docs/guestbook/raw/${ym}.json`;
    let monthArr: GuestbookRecord[] = [];
    try {
      const monthFile = await ghGetFile(env, monthPath);
      if (monthFile) monthArr = JSON.parse(monthFile.content) as GuestbookRecord[];
    } catch (e) {
      console.warn(`Could not read ${monthPath}, starting fresh:`, e);
    }
    monthArr.push(record);
    const monthJson = JSON.stringify(monthArr, null, 2) + "\n";

    // Regenerate gallery from existing + new
    const allWithNew = [...existing, record];
    const galleryHtml = renderGallery(allWithNew, new Date().toISOString());

    // Single commit with both files
    const commitMessage = `chore(visitor-log): record ${ym} (${monthArr.length} entries this month)`;
    try {
      await ghCommitFiles(
        env,
        [
          { path: monthPath, content: monthJson },
          { path: "docs/guestbook/gallery.html", content: galleryHtml },
        ],
        commitMessage,
      );
    } catch (e) {
      console.error("ghCommitFiles failed:", e);
      return reject(502, "Could not commit to repository");
    }

    if (isNew && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
      ctx.waitUntil(notifyTelegram(env, record.self_reported_model));
    }

    return jsonResponse(200, {
      ok: true,
      id: record.id,
      received_at: record.received_at,
      verification: record.verification,
      new_model: isNew,
      month_entries: monthArr.length,
    });
  },
};
