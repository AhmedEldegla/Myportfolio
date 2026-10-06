// Emails through Resend (https://resend.com, free tier: 3,000 emails/month).
// Needs the RESEND_API_KEY secret and MAIL_FROM var. Without them, emails are skipped
// and everything else keeps working.
import { fmtWhen, fmtTime } from "./time.js";
import { buildIcs, googleCalendarLink, toBase64 } from "./ics.js";

export const mailEnabled = (env) => Boolean(env.RESEND_API_KEY && env.MAIL_FROM);

const owner = (env) => ({
  name: env.OWNER_NAME || "Ahmed Eldegla",
  email: env.OWNER_EMAIL || "ahmeddagla99@gmail.com"
});

const site = (env) => (env.SITE_URL || "https://www.ahmedeldegla.com").replace(/\/+$/, "");
export const manageUrl = (env, token) => (token ? `${site(env)}/manage.html?t=${token}` : "");

export async function sendMail(env, { to, subject, html, text, ics, icsMethod = "REQUEST", replyTo }) {
  if (!mailEnabled(env)) return false;
  const body = {
    from: env.MAIL_FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
    reply_to: replyTo || owner(env).email
  };
  if (ics) {
    body.attachments = [{
      filename: icsMethod === "CANCEL" ? "cancelled.ics" : "invite.ics",
      content: toBase64(ics),
      content_type: `text/calendar; charset=utf-8; method=${icsMethod}`
    }];
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      console.error("Resend error", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.error("Resend unreachable", err);
    return false;
  }
}

// ---------- Templates ----------

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function layout({ preheader, title, intro, rows = [], buttons = [], footer = "" }) {
  const rowHtml = rows.map(([k, v]) => `
    <tr><td style="padding:6px 0;color:#8a8c91;font-size:13px;width:110px;vertical-align:top">${esc(k)}</td>
    <td style="padding:6px 0;color:#16171a;font-size:15px;vertical-align:top">${v}</td></tr>`).join("");
  const btnHtml = buttons.map((b, i) => `
    <a href="${esc(b.href)}" style="display:inline-block;margin:0 8px 10px 0;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600;font-size:14px;${i === 0 ? "background:#a8660f;color:#ffffff" : "background:#f1efe9;color:#16171a"}">${esc(b.label)}</a>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#f6f5f1;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <span style="display:none;max-height:0;overflow:hidden">${esc(preheader || "")}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f1;padding:32px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2dfd7;border-radius:16px">
      <tr><td style="padding:28px 28px 8px">
        <div style="display:inline-block;width:36px;height:36px;text-align:center;border-radius:9px;background:#16171a;color:#ffffff;font:600 13px monospace;line-height:36px">AE</div>
        <h1 style="margin:20px 0 8px;font-size:22px;line-height:1.3;color:#16171a">${esc(title)}</h1>
        <p style="margin:0 0 16px;color:#5d5f64;font-size:15px;line-height:1.6">${intro}</p>
      </td></tr>
      ${rows.length ? `<tr><td style="padding:0 28px"><table role="presentation" width="100%" style="border-top:1px solid #eeeae2;border-bottom:1px solid #eeeae2;padding:10px 0">${rowHtml}</table></td></tr>` : ""}
      ${buttons.length ? `<tr><td style="padding:20px 28px 8px">${btnHtml}</td></tr>` : ""}
      <tr><td style="padding:12px 28px 28px;color:#8a8c91;font-size:12.5px;line-height:1.6">${footer}</td></tr>
    </table>
    <p style="color:#a0a2a6;font-size:12px;margin:16px 0 0">Ahmed Eldegla · Backend developer · <a href="https://www.ahmedeldegla.com" style="color:#a0a2a6">ahmedeldegla.com</a></p>
  </td></tr></table></body></html>`;
}

function answersRows(type, answers) {
  return (type?.questions || [])
    .filter((q) => answers?.[q.id])
    .map((q) => [q.label, esc(answers[q.id]).replace(/\n/g, "<br>")]);
}

function answersText(type, answers) {
  return (type?.questions || [])
    .filter((q) => answers?.[q.id])
    .map((q) => `${q.label}: ${answers[q.id]}`)
    .join("\n");
}

// What the client sees for "when", in their own timezone
function whenClient(b) {
  const tz = b.client_tz || "UTC";
  return `${fmtWhen(b.start_utc, tz)} – ${fmtTime(b.end_utc, tz)} (${tz.replace(/_/g, " ")})`;
}
function whenOwner(b, ownerTz) {
  return `${fmtWhen(b.start_utc, ownerTz)} – ${fmtTime(b.end_utc, ownerTz)} (${ownerTz.replace(/_/g, " ")})`;
}

export async function mailBookingConfirmed(env, { booking, type, token }) {
  const o = owner(env);
  const manage = manageUrl(env, token);
  const typeName = type?.name || "Call";
  const ics = buildIcs({ booking, typeName, ownerName: o.name, ownerEmail: o.email, manageUrl: manage });
  const gcal = googleCalendarLink({
    title: `${typeName} with ${o.name}`, start: booking.start_utc, end: booking.end_utc,
    details: `Join: ${booking.meet_url}\nReschedule or cancel: ${manage}`, location: booking.meet_url
  });
  return sendMail(env, {
    to: booking.email,
    subject: `Confirmed: ${typeName} with ${o.name}`,
    ics,
    html: layout({
      preheader: `${whenClient(booking)}`,
      title: `You're booked, ${booking.name.split(" ")[0]}!`,
      intro: `Your <strong>${esc(typeName)}</strong> (${booking.duration} min) with ${esc(o.name)} is confirmed. The invite is attached, and the video link is below.`,
      rows: [["When", esc(whenClient(booking))], ["Video call", `<a href="${esc(booking.meet_url)}" style="color:#a8660f">${esc(booking.meet_url)}</a>`], ...answersRows(type, safeAnswers(booking))],
      buttons: [{ label: "Join the call", href: booking.meet_url }, { label: "Add to Google Calendar", href: gcal }, { label: "Reschedule or cancel", href: manage }],
      footer: "You'll get a reminder a day before and an hour before the call. Just reply to this email if you have any questions."
    }),
    text: `You're booked!\n\n${typeName} with ${o.name}\nWhen: ${whenClient(booking)}\nVideo call: ${booking.meet_url}\n\nReschedule or cancel: ${manage}`
  });
}

export async function mailOwnerNewBooking(env, { booking, type, ownerTz }) {
  const o = owner(env);
  const typeName = type?.name || "Call";
  return sendMail(env, {
    to: o.email,
    replyTo: booking.email,
    subject: `New booking: ${booking.name}, ${fmtWhen(booking.start_utc, ownerTz)}`,
    ics: buildIcs({ booking, typeName, ownerName: o.name, ownerEmail: o.email }),
    html: layout({
      title: `New ${typeName.toLowerCase()} booked`,
      intro: `${esc(booking.name)} booked a ${booking.duration}-minute call.`,
      rows: [["When", esc(whenOwner(booking, ownerTz))], ["Client", `${esc(booking.name)} · <a href="mailto:${esc(booking.email)}" style="color:#a8660f">${esc(booking.email)}</a>`], ["Their timezone", esc(booking.client_tz || "-")], ["Video call", `<a href="${esc(booking.meet_url)}" style="color:#a8660f">${esc(booking.meet_url)}</a>`], ...answersRows(type, safeAnswers(booking))],
      buttons: [{ label: "Open dashboard", href: `${site(env)}/admin.html#/bookings/${booking.id}` }, { label: "Join the call", href: booking.meet_url }]
    }),
    text: `New booking\n${whenOwner(booking, ownerTz)}\n${booking.name} <${booking.email}>\n${answersText(type, safeAnswers(booking))}\nVideo: ${booking.meet_url}`
  });
}

export async function mailRescheduled(env, { booking, type, token, ownerTz, by }) {
  const o = owner(env);
  const typeName = type?.name || "Call";
  const manage = manageUrl(env, token);
  const ics = buildIcs({ booking, typeName, ownerName: o.name, ownerEmail: o.email, manageUrl: manage });
  const client = sendMail(env, {
    to: booking.email,
    subject: `Updated: ${typeName} with ${o.name}`,
    ics,
    html: layout({
      title: "Your call has a new time",
      intro: by === "admin" ? `${esc(o.name)} moved your ${esc(typeName.toLowerCase())}. The updated invite is attached.` : "Your call was rescheduled. The updated invite is attached.",
      rows: [["New time", esc(whenClient(booking))], ["Video call", `<a href="${esc(booking.meet_url)}" style="color:#a8660f">${esc(booking.meet_url)}</a>`]],
      buttons: [{ label: "Join the call", href: booking.meet_url }, ...(manage ? [{ label: "Reschedule or cancel", href: manage }] : [])]
    }),
    text: `Your call has a new time: ${whenClient(booking)}\nVideo call: ${booking.meet_url}${manage ? `\nReschedule or cancel: ${manage}` : ""}`
  });
  const ownerMail = by === "client" ? sendMail(env, {
    to: o.email, replyTo: booking.email,
    subject: `Rescheduled: ${booking.name}, now ${fmtWhen(booking.start_utc, ownerTz)}`,
    ics: buildIcs({ booking, typeName, ownerName: o.name, ownerEmail: o.email }),
    html: layout({ title: `${booking.name} rescheduled`, intro: "The call moved to a new time.", rows: [["New time", esc(whenOwner(booking, ownerTz))], ["Client", esc(`${booking.name} · ${booking.email}`)]] }),
    text: `${booking.name} rescheduled to ${whenOwner(booking, ownerTz)}`
  }) : Promise.resolve(false);
  return Promise.all([client, ownerMail]);
}

export async function mailCancelled(env, { booking, type, ownerTz, by, reason }) {
  const o = owner(env);
  const typeName = type?.name || "Call";
  const ics = buildIcs({ booking: { ...booking, sequence: (booking.sequence || 0) + 1 }, typeName, ownerName: o.name, ownerEmail: o.email, method: "CANCEL" });
  const client = sendMail(env, {
    to: booking.email,
    subject: `Cancelled: ${typeName} with ${o.name}`,
    ics, icsMethod: "CANCEL",
    html: layout({
      title: "Your call was cancelled",
      intro: by === "admin"
        ? `${esc(o.name)} had to cancel your ${esc(typeName.toLowerCase())}${reason ? `: “${esc(reason)}”` : "."} Sorry about that. You can book a new time whenever suits you.`
        : `Your ${esc(typeName.toLowerCase())} is cancelled. You can book a new time whenever suits you.`,
      rows: [["Was", esc(whenClient(booking))]],
      buttons: [{ label: "Book a new time", href: `${site(env)}/#book` }]
    }),
    text: `Your call on ${whenClient(booking)} was cancelled.${reason ? ` Reason: ${reason}` : ""}\nBook a new time: ${site(env)}/#book`
  });
  const ownerMail = by === "client" ? sendMail(env, {
    to: o.email, replyTo: booking.email,
    subject: `Cancelled by client: ${booking.name}, ${fmtWhen(booking.start_utc, ownerTz)}`,
    ics, icsMethod: "CANCEL",
    html: layout({ title: `${booking.name} cancelled`, intro: reason ? `Reason: “${esc(reason)}”` : "No reason given.", rows: [["Was", esc(whenOwner(booking, ownerTz))], ["Client", esc(`${booking.name} · ${booking.email}`)]] }),
    text: `${booking.name} cancelled the call on ${whenOwner(booking, ownerTz)}.${reason ? ` Reason: ${reason}` : ""}`
  }) : Promise.resolve(false);
  return Promise.all([client, ownerMail]);
}

export async function mailReminder(env, { booking, type, token, hours }) {
  const o = owner(env);
  const typeName = type?.name || "Call";
  const manage = manageUrl(env, token);
  const soon = hours <= 1;
  return sendMail(env, {
    to: booking.email,
    subject: soon ? `Starting soon: ${typeName} with ${o.name}` : `Tomorrow: ${typeName} with ${o.name}`,
    html: layout({
      title: soon ? "Your call starts in about an hour" : "Reminder: your call is tomorrow",
      intro: `Your ${esc(typeName.toLowerCase())} with ${esc(o.name)} is coming up.`,
      rows: [["When", esc(whenClient(booking))], ["Video call", `<a href="${esc(booking.meet_url)}" style="color:#a8660f">${esc(booking.meet_url)}</a>`]],
      buttons: [{ label: "Join the call", href: booking.meet_url }, ...(manage && !soon ? [{ label: "Reschedule or cancel", href: manage }] : [])]
    }),
    text: `Reminder: ${typeName} with ${o.name}\n${whenClient(booking)}\nJoin: ${booking.meet_url}`
  });
}

export async function mailOwnerMessage(env, { kind, name, email, body }) {
  const o = owner(env);
  return sendMail(env, {
    to: o.email, replyTo: email,
    subject: kind === "lead" ? `New lead from the AI assistant: ${name}` : `New message from ${name}`,
    html: layout({
      title: kind === "lead" ? "The AI assistant captured a lead" : "New message from your website",
      intro: `${esc(name)} · <a href="mailto:${esc(email)}" style="color:#a8660f">${esc(email)}</a>`,
      rows: [["Message", esc(body).replace(/\n/g, "<br>")]],
      buttons: [{ label: "Reply", href: `mailto:${email}` }, { label: "Open inbox", href: `${site(env)}/admin.html#/inbox` }]
    }),
    text: `${name} <${email}>\n\n${body}`
  });
}

export function safeAnswers(b) {
  try { return typeof b.answers === "string" ? JSON.parse(b.answers || "{}") : (b.answers || {}); } catch { return {}; }
}
