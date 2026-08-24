// Quarantine digest. Invoked by pg_cron every 6 hours (and manually with the
// cron secret); sends at most one email per run.
//
// The email is a notification, not a workspace: how many games are waiting,
// which plausibility limits they tripped, and a link to the review queue where
// they can be approved in bulk. It used to carry a full ten-player scoreboard
// per game with per-game approve/deny links, which worked for a trickle and
// fell apart the first time a backfill quarantined hundreds of games at once —
// twenty per email, one email every six hours.
//
// The queue link carries an expiring key derived from review_secret, in the
// URL fragment so it never reaches a server log or a Referer header. It is a
// bearer credential: anyone holding it can approve or deny until it expires.
// Rotating review_secret in admin_config revokes every outstanding one.
//
// If no Resend API key is configured yet, pending items are left unmarked so
// they appear in the first digest after a key is added.
import { createClient } from "npm:@supabase/supabase-js@2";

const QUEUE_PAGE = "https://mayhemstats.com/review/queue/";

// Long enough to still work when the mail is read a few days later, short
// enough that a forwarded or leaked inbox stops being useful reasonably soon
const LINK_TTL_S = 7 * 24 * 60 * 60;

// Mirrors MAX_PENDING_QUARANTINE in the ingest function: a contributor at or
// over this has their uploads rejected until the backlog clears, which is
// worth saying out loud in the email.
const MAX_PENDING_QUARANTINE = 25;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function esc(s: unknown): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// The reason strings carry the game's own numbers ("381273 damage taken in
// 1365s"), so group by the limit that tripped rather than the exact text
function category(reason: string): string {
  if (reason.includes("damage taken")) return "damage taken";
  if (reason.includes("damage dealt")) return "damage dealt";
  if (reason.includes("healing")) return "healing";
  if (reason.includes("gold")) return "gold";
  if (reason.includes("kills")) return "kills";
  if (reason.includes("deaths")) return "deaths";
  if (reason.includes("assists")) return "assists";
  return "other";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    // Allow empty body; secret may come via header
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const cfg = await supabase
    .from("admin_config")
    .select("key, value")
    .in("key", ["cron_secret", "review_secret", "notify_email", "digest_from", "resend_api_key"]);
  if (cfg.error) return json({ error: "config unavailable" }, 500);
  const conf = new Map(cfg.data.map((r: any) => [r.key, r.value]));

  const given = body?.cronSecret ?? req.headers.get("x-cron-secret");
  if (!conf.get("cron_secret") || given !== conf.get("cron_secret")) {
    return json({ error: "unauthorized" }, 403);
  }

  // Renders the email and hands it back instead of sending it, and marks
  // nothing as notified. For checking the template without waiting for a
  // real quarantine.
  const preview = body?.preview === true;

  const pending = await supabase
    .from("quarantine")
    .select("id, contributor_token, reasons, created_at, notified_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(5000);
  if (pending.error) return json({ error: "query failed" }, 500);

  const rows = pending.data ?? [];
  const fresh = rows.filter((q: any) => q.notified_at === null);

  // Silence unless something new has arrived. The backlog alone shouldn't
  // generate an identical email every six hours — the queue page is where a
  // backlog gets worked, and it doesn't need a reminder to still exist.
  if (fresh.length === 0 && !preview) {
    return json({ sent: false, reason: rows.length === 0 ? "nothing pending" : "nothing new" });
  }

  const resendKey = conf.get("resend_api_key");
  if (!resendKey && !preview) {
    // Leave notified_at unset so these make the first digest after a key is
    // configured
    return json({ sent: false, reason: "resend_api_key not configured", pending: rows.length });
  }

  const secret = conf.get("review_secret");
  if (!secret) return json({ error: "review_secret missing" }, 500);

  const exp = Math.floor(Date.now() / 1000) + LINK_TTL_S;
  const adminKey = await sha256Hex(`${secret}:admin:${exp}`);
  const queueUrl = `${QUEUE_PAGE}#exp=${exp}&key=${adminKey}`;
  const expiresOn = new Date(exp * 1000).toISOString().slice(0, 10);

  // Which limits tripped, and over how many games
  const flagCount = new Map<string, number>();
  const gamesPerCategory = new Map<string, Set<string>>();
  for (const q of rows) {
    for (const r of q.reasons ?? []) {
      const c = category(r);
      flagCount.set(c, (flagCount.get(c) ?? 0) + 1);
      if (!gamesPerCategory.has(c)) gamesPerCategory.set(c, new Set());
      gamesPerCategory.get(c)!.add(q.id);
    }
  }
  const cell = "padding:5px 10px;font-size:13px";
  const breakdown = [...flagCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c, flags]) =>
      `<tr>
        <td style="${cell};color:#e2e8f0">${esc(c)}</td>
        <td style="${cell};color:#94a0b8">${gamesPerCategory.get(c)!.size}</td>
        <td style="${cell};color:#94a0b8">${flags}</td>
      </tr>`
    )
    .join("");

  // Contributors whose uploads ingest is now refusing
  const perToken = new Map<string, number>();
  for (const q of rows) perToken.set(q.contributor_token, (perToken.get(q.contributor_token) ?? 0) + 1);
  const blocked = [...perToken.values()].filter((n) => n >= MAX_PENDING_QUARANTINE).length;

  const oldest = rows[0]?.created_at
    ? String(rows[0].created_at).slice(0, 16).replace("T", " ") + " UTC"
    : "—";

  const html = `
    <div style="font-family:'Segoe UI',system-ui,sans-serif;background:#0b0e14;color:#e2e8f0;padding:24px;border-radius:16px;max-width:560px">
      <div style="font-size:18px;font-weight:700;margin-bottom:4px">
        <span style="color:#c89b3c">Mayhem</span>Stats review queue
      </div>
      <div style="font-size:34px;font-weight:700;line-height:1.2;margin:14px 0 2px">${rows.length}</div>
      <div style="color:#94a0b8;font-size:13px;margin-bottom:16px">
        game${rows.length === 1 ? "" : "s"} held out of the community stats${
          fresh.length > 0 && fresh.length !== rows.length
            ? ` &middot; <span style="color:#fbbf24">${fresh.length} new since the last digest</span>`
            : ""
        }<br/>oldest waiting since ${esc(oldest)}
      </div>
      ${
        blocked > 0
          ? `<div style="background:#3b2b12;border-radius:8px;padding:10px 12px;font-size:13px;color:#fbbf24;margin-bottom:16px">
              ${blocked} contributor${blocked === 1 ? " has" : "s have"} ${MAX_PENDING_QUARANTINE}+ games pending —
              their uploads are being rejected until this clears.
            </div>`
          : ""
      }
      <table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;margin-bottom:18px">
        <tr>
          <th align="left" style="${cell};color:#94a0b8;font-weight:600">Limit tripped</th>
          <th align="left" style="${cell};color:#94a0b8;font-weight:600">Games</th>
          <th align="left" style="${cell};color:#94a0b8;font-weight:600">Flags</th>
        </tr>
        ${breakdown}
      </table>
      <a href="${queueUrl}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 22px;border-radius:8px">
        Open the review queue
      </a>
      <div style="color:#94a0b8;font-size:12px;line-height:1.6;margin-top:16px">
        Approve or deny them in bulk, or one at a time, from that page. Nothing
        happens until you press a button there.<br/>
        The link works until ${esc(expiresOn)} and is the credential itself —
        treat it like a password. To revoke it, change <span style="font-family:Consolas,monospace">review_secret</span>.
      </div>
    </div>`;

  if (preview) {
    return json({ preview: true, pending: rows.length, new: fresh.length, html });
  }

  const send = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: conf.get("digest_from") ?? "MayhemStats <onboarding@resend.dev>",
      to: [conf.get("notify_email")],
      subject: `MayhemStats: ${rows.length} game${rows.length === 1 ? "" : "s"} awaiting review`,
      html,
    }),
  });
  if (!send.ok) {
    const errText = await send.text();
    return json({ sent: false, reason: `resend error ${send.status}`, detail: errText }, 502);
  }

  // Everything pending is covered by this email — the link opens the whole
  // queue, not a page of it — so nothing is left to ride the next digest.
  const upd = await supabase
    .from("quarantine")
    .update({ notified_at: new Date().toISOString() })
    .eq("status", "pending")
    .is("notified_at", null);
  if (upd.error) return json({ sent: true, warning: "failed to mark notified" });

  return json({ sent: true, pending: rows.length, new: fresh.length });
});
