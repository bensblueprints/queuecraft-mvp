# Product Hunt Launch — Queuecraft

## Name
Queuecraft

## Tagline (≤60 chars)
Self-hosted viral waitlist — pay once, skip the $29/mo

(54 characters)

## Description (≤260 chars)
Queuecraft is a self-hosted waitlist with referral queue-jumping: hosted page + embed widget, unique referral links that move you up the line, double opt-in via your own SMTP, broadcasts and CSV export. $29 once instead of LaunchList's $29/mo. MIT source.

(253 characters)

## Full description
Every launch playbook says the same thing: open a waitlist early, reward referrals, email the list on launch day. The tools that do this — LaunchList ($29/mo), GetWaitlist ($50/mo), Prefinery (from $137/mo) — charge monthly rent for what is, at its core, a signup form and a ranking query.

Queuecraft is that whole stack as a one-time purchase you run yourself:

- **Hosted page + embed widget** — every waitlist gets `/w/your-slug` and a one-line `<script>` snippet with shadow-DOM-isolated styles
- **Referral queue-jumping** — each signup gets a unique link; every verified referral moves them up N spots (you pick N). "You're #42 of 1,203 — refer 3 friends to jump the line."
- **Double opt-in via YOUR SMTP** — Nodemailer + a SQLite-backed retry queue. Unverified emails never credit referrers, and a bad SMTP config can't lose a signup
- **Broadcasts** — "we're live!" to everyone, verified only, or your top-N superfans, with {{position}} / {{referral_link}} placeholders
- **Anti-spam that actually ships** — 450+ disposable domains blocked, per-IP rate limits, honeypot, Gmail dot/+tag dedupe, self-referral prevention, per-IP referral caps
- **CSV export & zero lock-in** — it's your SQLite file on your disk

Run it as a Windows desktop app (`npm run desktop`) or on a $5 VPS with the included Dockerfile. Dark-mode admin built with React + Tailwind. MIT licensed.

## Maker first comment
Hey PH 👋

I got tired of paying $29/mo to collect emails. Every side project I launch starts with a waitlist, and every time I'd sign up for LaunchList or GetWaitlist, use maybe 10% of the features, and then keep paying for months while I actually built the product. My last launch cost me $174 in waitlist subscription fees before a single customer paid me anything.

So I built Queuecraft: the referral-waitlist mechanic (the only part that matters) as a self-hosted tool you buy once. It's a single Node process with a SQLite file — the same stack I trust for my own launches. Emails go through your own SMTP, so your deliverability and your list stay yours.

The source is MIT on GitHub — if you're comfortable with `npm i && npm start`, it's free forever. The paid version is a 1-click Windows installer for people who'd rather not touch a terminal.

Happy to answer anything about the referral-ranking math, the anti-fraud bits (self-referral is a fun cat-and-mouse game), or self-hosting email. 🙏

## Gallery shots (5)
1. **Hero** — dark hosted waitlist page (`/w/beta`) showing the "You're #42 of 1,203" position card with referral link + share buttons, accent purple.
2. **Admin dashboard** — waitlist cards with signups / verified % / top referrer stats.
3. **Subscriber table** — positions, referral counts, verified badges, search box and Export CSV button visible.
4. **Broadcast composer** — subject + body with {{placeholders}}, audience selector on "Verified only", success toast "Queued 1,203 emails".
5. **Comparison graphic** — "Queuecraft $29 once vs LaunchList $348/yr" side-by-side with the embed snippet shown underneath ("one line to add it to your site").
