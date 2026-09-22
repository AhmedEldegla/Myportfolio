// Optional instant alerts. Skipped silently unless both secrets are set:
//   npx wrangler secret put TELEGRAM_BOT_TOKEN
//   npx wrangler secret put TELEGRAM_CHAT_ID
export async function notifyTelegram(env, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true })
    });
    if (!res.ok) console.error("Telegram error", res.status, await res.text().catch(() => ""));
  } catch (err) {
    console.error("Telegram unreachable", err);
  }
}
