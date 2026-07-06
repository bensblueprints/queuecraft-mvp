// All outgoing mail goes through a SQLite queue with retry, so a bad SMTP
// config can never lose signups. BYO SMTP only — no bundled sending service.
import nodemailer from 'nodemailer';
import db, { getSetting } from './db.js';

const MAX_ATTEMPTS = 5;

export function getSmtpConfig() {
  const cfg = {
    host: getSetting('smtp_host', process.env.SMTP_HOST || ''),
    port: parseInt(getSetting('smtp_port', process.env.SMTP_PORT || '587'), 10),
    secure: (getSetting('smtp_secure', process.env.SMTP_SECURE || 'false')) === 'true',
    user: getSetting('smtp_user', process.env.SMTP_USER || ''),
    pass: getSetting('smtp_pass', process.env.SMTP_PASS || ''),
    from: getSetting('smtp_from', process.env.SMTP_FROM || '')
  };
  return cfg;
}

export function smtpConfigured() {
  if (process.env.SMTP_DISABLED === 'true') return false;
  const cfg = getSmtpConfig();
  return Boolean(cfg.host && cfg.from);
}

export function buildTransport(cfg = getSmtpConfig()) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000
  });
}

export function enqueue(toEmail, subject, html, sendAfter = 0) {
  return db
    .prepare('INSERT INTO email_queue (to_email, subject, html, send_after) VALUES (?, ?, ?, ?)')
    .run(toEmail, subject, html, sendAfter).lastInsertRowid;
}

let processing = false;

export async function processQueue() {
  if (processing || !smtpConfigured()) return;
  processing = true;
  try {
    const rows = db
      .prepare(
        "SELECT * FROM email_queue WHERE status = 'pending' AND send_after <= ? ORDER BY id LIMIT 10"
      )
      .all(Date.now());
    if (rows.length === 0) return;
    const cfg = getSmtpConfig();
    const transport = buildTransport(cfg);
    for (const row of rows) {
      try {
        await transport.sendMail({
          from: cfg.from,
          to: row.to_email,
          subject: row.subject,
          html: row.html
        });
        db.prepare("UPDATE email_queue SET status = 'sent', attempts = attempts + 1 WHERE id = ?").run(row.id);
      } catch (err) {
        const attempts = row.attempts + 1;
        const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
        const backoff = Date.now() + Math.min(60 * 60000, 60000 * 2 ** attempts);
        db.prepare(
          'UPDATE email_queue SET status = ?, attempts = ?, last_error = ?, send_after = ? WHERE id = ?'
        ).run(status, attempts, String(err.message || err).slice(0, 500), backoff, row.id);
      }
    }
    transport.close();
  } finally {
    processing = false;
  }
}

let timer = null;
export function startQueue() {
  const interval = parseInt(process.env.EMAIL_QUEUE_INTERVAL_MS || '15000', 10);
  timer = setInterval(() => processQueue().catch(() => {}), interval);
  timer.unref?.();
}

export function stopQueue() {
  if (timer) clearInterval(timer);
}

export async function testSend(to) {
  const cfg = getSmtpConfig();
  if (!cfg.host) throw new Error('SMTP host is not configured');
  const transport = buildTransport(cfg);
  await transport.sendMail({
    from: cfg.from,
    to,
    subject: 'Queuecraft SMTP test',
    html: '<p>Your SMTP settings work. Queuecraft can send emails. 🎉</p>'
  });
  transport.close();
}

// ---------- templates ----------
export function baseUrl(req) {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, '');
  if (req) return `${req.protocol}://${req.get('host')}`;
  return `http://localhost:${process.env.PORT || 5324}`;
}

const wrap = (inner) => `
<div style="background:#0b0b12;padding:32px 16px;font-family:Segoe UI,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#15151f;border:1px solid #2a2a3a;border-radius:14px;padding:32px;color:#e6e6f0">
    ${inner}
    <p style="color:#6b6b80;font-size:12px;margin-top:28px">Sent by Queuecraft — self-hosted waitlists.</p>
  </div>
</div>`;

export function verificationEmail({ waitlistName, verifyUrl, position, total, referralUrl }) {
  return {
    subject: `Confirm your spot on the ${waitlistName} waitlist`,
    html: wrap(`
      <h2 style="margin:0 0 12px">You're almost in 👋</h2>
      <p>Confirm your email to lock in your place on the <b>${waitlistName}</b> waitlist.</p>
      <p style="margin:24px 0"><a href="${verifyUrl}" style="background:#7c5cff;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600">Confirm my email</a></p>
      <p>You're currently <b>#${position} of ${total}</b>. Want to jump the line? Share your personal link — every friend who joins moves you up:</p>
      <p style="word-break:break-all"><a href="${referralUrl}" style="color:#9d8cff">${referralUrl}</a></p>
    `)
  };
}

export function welcomeEmail({ waitlistName, position, total, referralUrl, boost }) {
  return {
    subject: `You're #${position} on the ${waitlistName} waitlist`,
    html: wrap(`
      <h2 style="margin:0 0 12px">You're in ✅</h2>
      <p>You're <b>#${position} of ${total}</b> on the <b>${waitlistName}</b> waitlist.</p>
      <p>Every friend who signs up with your link moves you up <b>${boost} spots</b>:</p>
      <p style="word-break:break-all"><a href="${referralUrl}" style="color:#9d8cff">${referralUrl}</a></p>
    `)
  };
}

export function movedUpEmail({ waitlistName, position, total, referralUrl }) {
  return {
    subject: `You moved up! Now #${position} on ${waitlistName}`,
    html: wrap(`
      <h2 style="margin:0 0 12px">You jumped the line 🚀</h2>
      <p>A friend you referred just verified — you're now <b>#${position} of ${total}</b> on <b>${waitlistName}</b>.</p>
      <p>Keep climbing: <a href="${referralUrl}" style="color:#9d8cff">${referralUrl}</a></p>
    `)
  };
}
