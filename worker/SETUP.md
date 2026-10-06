# Backend setup: bookings, dashboard, emails, Google Meet

The backend is a Cloudflare Worker with a D1 database (both on Cloudflare's free tier).
It powers the booking window, the reschedule/cancel page, the contact form, the AI
assistant and the admin dashboard (`/admin.html`).

Run every command from this `worker/` folder.

## 1. Update the live backend (required, in this order)

```bash
npm install                 # installs wrangler locally
npx wrangler login          # once, if you haven't already
npm run migrate             # adds the new tables/columns to the live database
npx wrangler deploy         # publishes the new Worker
```

> Always run `npm run migrate` **before** `npx wrangler deploy`. The new code expects the
> new columns; your existing bookings are kept and keep working.

After this, everything works with no extra setup:

- Visitors pick a meeting type, a time and answer a few questions.
- Every booking gets a private video link (Jitsi) on the confirmation screen.
- Clients get a link to reschedule or cancel.
- You manage everything at **www.ahmedeldegla.com/admin.html**.

The three steps below are optional upgrades. Do them in any order.

## 2. Admin password (you already have one)

The dashboard signs in with the `ADMIN_PASSWORD` secret. To change it:

```bash
npx wrangler secret put ADMIN_PASSWORD
```

## 3. Emails: confirmations, invites, reminders (Resend, free)

Without this, no emails are sent: the confirmation screen still shows the video link and
calendar buttons, and you're still notified through EmailJS like before.

1. Create a free account at <https://resend.com>.
2. **Domains → Add domain** → `ahmedeldegla.com`. Resend shows a few DNS records
   (SPF, DKIM, and optionally DMARC).
3. Add those records at the company where you bought the domain (its DNS settings page),
   then click **Verify** in Resend. This usually takes a few minutes.
4. **API Keys → Create API key** (sending access is enough), then:

   ```bash
   npx wrangler secret put RESEND_API_KEY
   ```

5. Emails are sent from `MAIL_FROM` in `wrangler.toml`
   (`Ahmed Eldegla <hello@ahmedeldegla.com>`). Replies go to `OWNER_EMAIL`.

What gets sent:

- **Client:** a confirmation with a calendar invite (Google, Outlook, Apple) and the video
  link, reminders 24 hours and 1 hour before the call, and an update if the call is
  rescheduled or cancelled.
- **You:** a copy of every new booking, reschedule, cancellation and message.

You can turn each of these on or off in **Dashboard → Settings**.

## 4. Google Calendar + Google Meet links

With this connected, every booking becomes an event in your Google Calendar with a
**Google Meet** link, and anything already in your calendar is hidden from visitors, so
you're never double-booked.

1. Open <https://console.cloud.google.com>, create a project (e.g. "Portfolio bookings").
2. **APIs & Services → Library** → enable **Google Calendar API**.
3. **APIs & Services → OAuth consent screen**: choose *External*, fill in the app name and
   your email, and add yourself as a test user.
   Then set **Publishing status → In production**. In "Testing" mode Google expires the
   connection every 7 days. You'll see an "unverified app" warning when you connect your
   own account; that's expected, click *Advanced → Continue*.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   type *Web application*, and add this **Authorized redirect URI**:
   `https://developers.google.com/oauthplayground`
   Copy the **Client ID** and **Client secret**.
5. Go to <https://developers.google.com/oauthplayground>:
   - Click the gear icon (top right) → tick **Use your own OAuth credentials** → paste the
     Client ID and secret.
   - In "Input your own scopes", enter `https://www.googleapis.com/auth/calendar` and click
     **Authorize APIs**. Sign in with the Google account whose calendar you use.
   - Click **Exchange authorization code for tokens** and copy the **Refresh token**.
6. Save the three values as secrets:

   ```bash
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   npx wrangler secret put GOOGLE_REFRESH_TOKEN
   ```

   To use a calendar other than your main one, also set `GOOGLE_CALENDAR_ID`
   (find it in Google Calendar → calendar settings → *Integrate calendar*).

If Google is ever unreachable, the booking still goes through with a Jitsi link.

## 5. Telegram alerts (instant, on your phone)

1. In Telegram, message **@BotFather** → `/newbot` → copy the bot token.
2. Send any message to your new bot, then open
   `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `"chat":{"id": ...}`.
3. Save both:

   ```bash
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_CHAT_ID
   ```

## Your availability

Your weekly hours, notice period, buffer between calls, daily limit, days off and meeting
types are all edited in the dashboard (**Availability** and **Meeting types**). Changes
apply immediately; there's no need to redeploy. `src/schedule.js` only holds the starting
values used before you first save.

## Running it locally

```bash
cp .dev.vars.example .dev.vars   # then set ADMIN_PASSWORD (and any other secrets) in it
npm run migrate:local
npm run dev                      # API on http://localhost:8787
```

In another terminal, serve the website from the repository root on port 5173 (that origin
is allowed in `ALLOWED_ORIGINS`), e.g. `python3 -m http.server 5173`, and open
<http://localhost:5173>. The site and dashboard talk to the local API automatically.

## What's where

| File | What it does |
| --- | --- |
| `src/booking.js` | Meeting types, available times, booking, client reschedule/cancel |
| `src/admin.js` | Dashboard API (overview, bookings, calendar, inbox, chats, analytics, settings) |
| `src/auth.js` | Dashboard sign-in sessions |
| `src/settings.js` | Editable settings and their defaults |
| `src/meet.js` | Google Calendar/Meet, with the Jitsi fallback |
| `src/mail.js`, `src/ics.js` | Emails and calendar invites |
| `src/inbox.js` | Contact form, AI-assistant leads, analytics events |
| `src/cron.js` | Reminders and clean-up, every 10 minutes |
| `migrations/` | Database schema |
