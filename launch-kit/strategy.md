# Launch Strategy — Queuecraft

## Pricing math (lead with this everywhere)

Your waitlist runs for months **before** you make a cent:

| Tool | Monthly | 3-month pre-launch | 12 months |
|---|---|---|---|
| LaunchList Pro | $29/mo | $87 | $348 |
| GetWaitlist Pro | $50/mo | $150 | $600 |
| Prefinery | from $137/mo | $411 | $1,644 |
| **Queuecraft** | **$29 once** | **$29** | **$29** |

**"That's $87–$400 in subscriptions for a signup form. Queuecraft is $29 once, self-hosted, and your emails stay yours. It pays for itself in 1 month."**

## Suggested price
**$29 one-time** (Whop). Exactly one month of LaunchList Pro — makes the "pays for itself in 1 month" line literal. Anchor against Prefinery ($137/mo) in the copy for a 4.7× first-month saving story.

## Target communities (rules-aware angles)

- **r/SaaS** — allows self-promo in context. Angle: a build/teardown post: "The referral waitlist mechanic every SaaS uses, reduced to one SQLite query (and why I stopped renting it for $29/mo)". Share the ranking SQL and anti-fraud design; link repo in comments when asked.
- **r/indiehackers** — self-promo tolerated when it's a story. Angle: "I spent $174 on waitlist SaaS across 3 launches, so I built a pay-once replacement". Include real numbers, screenshots, what didn't work.
- **r/EntrepreneurRideAlong** — build-in-public friendly. Angle: journey post: launching the launch-tool; show the waitlist for Queuecraft running on Queuecraft (dogfooding hook).
- Secondary: r/selfhosted (strict no-spam — post only the MIT repo as "self-hosted LaunchList alternative", no sales language, Whop link stays in the README), Indie Hackers product directory, lobste.rs (show, tag `show`).

## Hacker News — Show HN draft

**Title:** Show HN: Queuecraft – self-hosted waitlist with referral queue-jumping (MIT)

**Post:**
Every launch checklist says "open a waitlist, reward referrals." The hosted tools for this charge $29–$137/month, which felt absurd for what is essentially one ranking query, so I built a self-hosted version and MIT-licensed it.

It's a single Node process + SQLite: hosted signup page per waitlist, an embeddable widget (shadow DOM so host CSS can't bleed in), unique referral links, and position = rank over (points DESC, created_at). Verified referrals add configurable points, so position is always computed, never stored — no drift as referrals land.

Email is deliberately BYO-SMTP (nodemailer) with a SQLite-backed retry queue: verification links are double opt-in, unverified signups never credit the referrer, and a bad SMTP config can't lose signups. Anti-fraud was the fun part: disposable-domain blocklist, honeypot, per-IP rate limits, Gmail dot/+tag normalization, self-referral detection, and a cap on credited referrals per referrer per IP.

Runs as an Electron desktop app or on a VPS via the included Dockerfile (the better-sqlite3 dual-ABI dance for Node vs Electron was its own adventure). There's a paid 1-click Windows installer for non-technical folks, but the repo is the full product.

Happy to discuss the ranking design or referral-fraud tradeoffs.

## SEO keywords (10)
1. self hosted waitlist
2. launchlist alternative
3. getwaitlist alternative
4. viral waitlist tool
5. referral waitlist software
6. waitlist widget for website
7. prelaunch waitlist page
8. waitlist with referral links
9. open source waitlist
10. prefinery alternative

## AppSumo / PitchGround pitch

Queuecraft turns any launch into a referral loop: a hosted signup page and one-line embed widget where every subscriber gets a unique link, and every verified referral jumps them up the queue — the exact mechanic behind Robinhood's and Superhuman's million-person waitlists. Unlike LaunchList ($29/mo), GetWaitlist ($50/mo) or Prefinery (from $137/mo), Queuecraft is a one-time purchase your customers self-host: unlimited waitlists, unlimited subscribers, double opt-in through their own SMTP, launch broadcasts, CSV export, and serious anti-spam (disposable-email blocklist, honeypot, rate limits, referral-fraud caps) — with zero recurring cost and zero data lock-in. It ships as both a Windows desktop app and a Docker deployment, with MIT source for full auditability. Sumo-lings who launch even twice a year save hundreds annually — this is the waitlist tool that pays for itself before the waitlist does.

## Launch sequence (suggested)
1. Dogfood: put Queuecraft's own waitlist live at `/w/queuecraft`, seed with newsletter.
2. Show HN (Tue–Thu morning ET) → repo README already has Whop link.
3. Product Hunt the following week with the HN feedback baked in.
4. Reddit story posts staggered over 2 weeks (different angles per sub above).
5. X thread: the anti-fraud engineering story ("how people cheat waitlists").
