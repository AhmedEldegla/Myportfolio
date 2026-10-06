// Runs every 10 minutes (see [triggers] in wrangler.toml): call reminders and housekeeping.
import { getSetting } from "./settings.js";
import { typeById } from "./booking.js";
import { mailEnabled, mailReminder } from "./mail.js";

const H = 3600 * 1000;

export async function runScheduled(env) {
  if (!env.DB) return;
  const now = Date.now();
  const notif = await getSetting(env, "notifications");

  if (notif.reminders && mailEnabled(env)) {
    const { results } = await env.DB
      .prepare("SELECT * FROM bookings WHERE status = 'confirmed' AND start_utc > ?1 AND start_utc <= ?2 AND reminded < 3")
      .bind(new Date(now).toISOString(), new Date(now + 24 * H + 15 * 60000).toISOString())
      .all();

    for (const b of results) {
      const start = Date.parse(b.start_utc);
      const type = await typeById(env, b.type_id);
      let bit = 0, hours = 0;
      if (!(b.reminded & 2) && start - now <= 70 * 60000) {
        bit = 2; hours = 1;
      } else if (!(b.reminded & 1) && start - now > 2 * H && start - Date.parse(b.created_at) > 25 * H) {
        // Only for calls booked more than a day ahead, so nobody gets a "tomorrow" email right after booking
        bit = 1; hours = 24;
      }
      if (!bit) continue;
      // Claim the reminder first so overlapping runs never send it twice
      const claim = await env.DB
        .prepare("UPDATE bookings SET reminded = reminded | ?1 WHERE id = ?2 AND (reminded & ?1) = 0")
        .bind(bit, b.id).run();
      if (!claim.meta.changes) continue;
      // The reminder links to the manage page only when we still know the token (we don't: only its hash)
      await mailReminder(env, { booking: b, type, token: "", hours });
    }
  }

  // Housekeeping
  const iso = (ms) => new Date(ms).toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?1").bind(iso(now)),
    env.DB.prepare("DELETE FROM events WHERE created_at < ?1").bind(iso(now - 400 * 24 * H)),
    env.DB.prepare("DELETE FROM chat_messages WHERE created_at < ?1").bind(iso(now - 180 * 24 * H))
  ]);
}
