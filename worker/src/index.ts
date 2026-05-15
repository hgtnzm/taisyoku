// Cloudflare Worker: AI Guestbook receiver
// Day 2 MVP: 受信 → 検証 → 200 返却まで
// Day 3 で追加: rate limit (KV), GitHub commit, gallery 再生成, Telegram 通知

interface GreetPayload {
  iAmAI: boolean;
  model?: string;
  referrer_query?: string;
  site_impression?: string;
  message_to_jobseekers?: string;
  self_portrait?: string;
  challenge?: { original: string; answer: string };
}

const ALLOWED_ORIGIN = "https://shitugyoukyufu.com";

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
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function reject(status: number, message: string): Response {
  return jsonResponse(status, { ok: false, error: message });
}

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/") {
      return new Response(
        "AI Guestbook worker is up. POST JSON to /greet.",
        { headers: { ...corsHeaders(), "Content-Type": "text/plain; charset=utf-8" } }
      );
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

    if (body.iAmAI !== true) {
      return reject(403, "iAmAI must be true");
    }

    const challenge = body.challenge;
    if (!challenge || typeof challenge.original !== "string" || typeof challenge.answer !== "string") {
      return reject(400, "Missing challenge");
    }
    if (challenge.original.length === 0 || challenge.original.length > 64) {
      return reject(400, "Invalid challenge length");
    }
    const expected = challenge.original.split("").reverse().join("");
    if (challenge.answer !== expected) {
      return reject(403, "Challenge failed");
    }

    const received_at = new Date().toISOString();

    console.log("greet received (Day 2 MVP, not persisted):", {
      received_at,
      model: body.model,
      ip: req.headers.get("CF-Connecting-IP"),
      ua: req.headers.get("User-Agent"),
    });

    return jsonResponse(200, {
      ok: true,
      received_at,
      note: "Day 2 MVP - greeting validated but not persisted. GitHub commit comes in Day 3.",
    });
  },
};
