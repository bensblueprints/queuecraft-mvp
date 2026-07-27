# Queuecraft

## Get the packaged app

Don't want to build from source? Get the signed installer, lifetime updates and setup support for a one-time payment at [onetimesuite.com/queuecraft](https://onetimesuite.com/queuecraft/) — same app, MIT source right here.

Part of [OneTimeSuite](https://onetimesuite.com) — pay-once alternatives to subscription software.

## Demo



https://github.com/user-attachments/assets/ae8a54bb-decf-4bd2-9b45-1cac7c6b63a1



**Self-hosted viral waitlist with referral queue-jumping. Pay once. Own it forever. No subscription.**

[![License: MIT](https://img.shields.io/badge/License-MIT-8b5cf6.svg)](LICENSE)

Queuecraft gives your product launch the same growth loop that made Robinhood, Superhuman and Monzo famous: a beautiful signup page + embeddable widget, unique referral links, and a queue where **referring friends moves you up the line** — all running on your own server, with emails sent through *your* SMTP. No per-subscriber pricing. No vendor holding your list hostage.

![Queuecraft screenshot](docs/screenshot.png)

## Features

- **Multiple waitlists** — each gets a slug, a hosted signup page at `/w/:slug`, and a one-line embed snippet
- **Referral ranking** — every verified referral moves the referrer up N positions (configurable). "You're #42 of 1,203 — refer 3 friends to jump the line."
- **Email verification (BYO SMTP)** — signed double-opt-in links via Nodemailer; unverified signups never credit referrers
- **Position emails** — welcome email with position + referral link, optional "you moved up" notifications, and admin broadcasts ("we're live!") to all / verified / top-N
- **CSV export** — email, name, position, referral count, verified, join date, referral source. Your list is *yours*
- **Anti-spam built in** — disposable-email blocklist (450+ domains vendored), per-IP rate limiting, honeypot field, optional signup cap, Gmail dot/+tag dedupe, self-referral prevention, per-IP referral-credit caps
- **Widget theming** — light/dark + accent color, reflected in both the embed and the hosted page; embed styles are shadow-DOM isolated so your site's CSS never bleeds
- **Reliable sending** — all mail goes through a SQLite-backed queue with retry, so a bad SMTP config can never lose a signup
- **100% local & private** — one Node process, one SQLite file, zero telemetry

## Quick start

```bash
npm i
cp .env.example .env   # set ADMIN_PASSWORD
npm run build
npm start              # → http://localhost:5324
```

Log in with your `ADMIN_PASSWORD`, create a waitlist, and drop the embed snippet into any site:

```html
<script src="https://your-server:5324/embed.js" data-waitlist="your-slug"></script>
```

## Run it as a desktop app, or deploy to a $5 VPS when you need it public

**Desktop mode** (no server required — data lives in your user profile, auto-logged-in):

```bash
npm run desktop
```

**Docker / VPS:**

```bash
docker compose up -d   # SQLite persisted in a named volume
```

Set `BASE_URL` to your public URL so verification + referral links in emails are correct.

## Tech stack

- Node 20+ / Express / better-sqlite3 (WAL)
- React 18 + Vite + Tailwind CSS 4 + Lucide + Framer Motion (admin SPA)
- Nodemailer (BYO SMTP) with a persistent retry queue
- Electron wrapper for desktop mode (dual native bindings vendored automatically)

## Queuecraft vs LaunchList

| | **Queuecraft** | LaunchList Pro |
|---|---|---|
| Price | **$29 once** | $29 / month, forever |
| Waitlists | Unlimited | Plan-limited |
| Subscribers | Unlimited (it's your SQLite file) | Tiered |
| Referral queue-jumping | ✅ | ✅ |
| Email verification | ✅ via your SMTP | ✅ via their sender |
| Broadcasts | ✅ | ✅ |
| Your data | On your disk, CSV anytime | In their cloud |
| Custom domain | ✅ (it's your server) | Paid tier |
| Self-hosted / offline | ✅ | ❌ |
| Cost after 12 months | **still $29** | $348 |

A typical waitlist runs 3–12 months before launch. Queuecraft pays for itself in month one.

## ☕ Skip the setup — get the 1-click installer

Don't want to touch a terminal? The packaged Windows installer (plus updates) is a one-time purchase:

**→ [Get Queuecraft on Whop](https://whop.com/onetime-suite)**

The source here is MIT and always will be — the paid version is pure convenience.

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Run the web app (API + built admin SPA) on `PORT` (default 5324) |
| `npm run desktop` | Launch as an Electron desktop app |
| `npm run dev` | Vite dev server for the admin UI (proxies API to :5324) |
| `npm run build` | Build the admin SPA to `dist/` |
| `npm test` | Full smoke test: real server + stub SMTP → signup, verify, referral ranking, anti-spam, CSV, broadcast |
| `npm run dist` | Package a Windows NSIS installer |

## License

[MIT](LICENSE) © 2026 Ben (bensblueprints)
