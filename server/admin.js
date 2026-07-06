import express from 'express';
import crypto from 'node:crypto';
import db, { getSetting, setSetting, positionOf, totalOf } from './db.js';
import {
  requireAuth,
  checkPassword,
  createSession,
  destroySession,
  isAuthed,
  COOKIE_NAME
} from './auth.js';
import { getSmtpConfig, testSend, enqueue, smtpConfigured, baseUrl } from './mailer.js';

const router = express.Router();

// ---------- auth ----------
router.post('/api/login', (req, res) => {
  if (!checkPassword(req.body?.password)) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  const token = createSession();
  res.cookie(COOKIE_NAME, token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 });
  res.json({ ok: true });
});

router.post('/api/logout', (req, res) => {
  destroySession(req.cookies?.[COOKIE_NAME]);
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

router.get('/api/me', (req, res) => res.json({ authed: isAuthed(req) }));

router.get('/api/health', (req, res) => res.json({ ok: true }));

// Everything below requires a session
router.use('/api', requireAuth);

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function waitlistStats(id) {
  const signups = totalOf(id);
  const verified = db
    .prepare('SELECT COUNT(*) AS c FROM subscribers WHERE waitlist_id = ? AND verified = 1')
    .get(id).c;
  const top = db
    .prepare(
      `SELECT s.email, COUNT(*) AS refs FROM referral_events e
       JOIN subscribers s ON s.id = e.referrer_id
       WHERE e.waitlist_id = ? AND e.credited = 1
       GROUP BY e.referrer_id ORDER BY refs DESC LIMIT 1`
    )
    .get(id);
  return { signups, verified, topReferrer: top || null };
}

// ---------- waitlists CRUD ----------
router.get('/api/waitlists', (req, res) => {
  const rows = db.prepare('SELECT * FROM waitlists ORDER BY created_at DESC').all();
  res.json(rows.map((w) => ({ ...w, stats: waitlistStats(w.id) })));
});

router.post('/api/waitlists', (req, res) => {
  const { name, slug, headline = '', description = '', referral_boost = 5, theme = {}, signup_cap = 0, require_verify = 1, notify_moveup = 0 } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Name is required' });
  let s = slugify(slug || name);
  if (!s) s = crypto.randomBytes(4).toString('hex');
  if (db.prepare('SELECT 1 FROM waitlists WHERE slug = ?').get(s)) {
    return res.status(409).json({ error: 'Slug already in use' });
  }
  const info = db
    .prepare(
      `INSERT INTO waitlists (slug, name, headline, description, referral_boost, theme_json, signup_cap, require_verify, notify_moveup)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(s, name, headline, description, Math.max(0, parseInt(referral_boost, 10) || 5), JSON.stringify(theme || {}), Math.max(0, parseInt(signup_cap, 10) || 0), require_verify ? 1 : 0, notify_moveup ? 1 : 0);
  const wl = db.prepare('SELECT * FROM waitlists WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ ...wl, stats: waitlistStats(wl.id) });
});

router.get('/api/waitlists/:id', (req, res) => {
  const wl = db.prepare('SELECT * FROM waitlists WHERE id = ?').get(req.params.id);
  if (!wl) return res.status(404).json({ error: 'Not found' });
  res.json({ ...wl, stats: waitlistStats(wl.id) });
});

router.put('/api/waitlists/:id', (req, res) => {
  const wl = db.prepare('SELECT * FROM waitlists WHERE id = ?').get(req.params.id);
  if (!wl) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  const next = {
    name: b.name ?? wl.name,
    headline: b.headline ?? wl.headline,
    description: b.description ?? wl.description,
    referral_boost: b.referral_boost != null ? Math.max(0, parseInt(b.referral_boost, 10) || 0) : wl.referral_boost,
    theme_json: b.theme != null ? JSON.stringify(b.theme) : wl.theme_json,
    signup_cap: b.signup_cap != null ? Math.max(0, parseInt(b.signup_cap, 10) || 0) : wl.signup_cap,
    require_verify: b.require_verify != null ? (b.require_verify ? 1 : 0) : wl.require_verify,
    notify_moveup: b.notify_moveup != null ? (b.notify_moveup ? 1 : 0) : wl.notify_moveup
  };
  db.prepare(
    `UPDATE waitlists SET name=@name, headline=@headline, description=@description, referral_boost=@referral_boost,
     theme_json=@theme_json, signup_cap=@signup_cap, require_verify=@require_verify, notify_moveup=@notify_moveup WHERE id=@id`
  ).run({ ...next, id: wl.id });
  const updated = db.prepare('SELECT * FROM waitlists WHERE id = ?').get(wl.id);
  res.json({ ...updated, stats: waitlistStats(wl.id) });
});

router.delete('/api/waitlists/:id', (req, res) => {
  db.prepare('DELETE FROM waitlists WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- subscribers ----------
router.get('/api/waitlists/:id/subscribers', (req, res) => {
  const wl = db.prepare('SELECT * FROM waitlists WHERE id = ?').get(req.params.id);
  if (!wl) return res.status(404).json({ error: 'Not found' });
  const search = String(req.query.search || '').trim();
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const perPage = 50;
  const where = search ? 'AND (email LIKE @q OR name LIKE @q)' : '';
  const params = { wid: wl.id, q: `%${search}%`, limit: perPage, offset: (page - 1) * perPage };
  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM subscribers WHERE waitlist_id = @wid ${where}`)
    .get(params).c;
  const rows = db
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM referral_events e WHERE e.referrer_id = s.id AND e.credited = 1) AS referral_count
       FROM subscribers s WHERE s.waitlist_id = @wid ${where}
       ORDER BY s.points DESC, s.created_at ASC, s.id ASC LIMIT @limit OFFSET @offset`
    )
    .all(params);
  res.json({
    total,
    page,
    perPage,
    subscribers: rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      position: positionOf(r.id),
      points: r.points,
      referral_count: r.referral_count,
      verified: !!r.verified,
      ref_code: r.ref_code,
      ref_source: r.referred_by
        ? db.prepare('SELECT email FROM subscribers WHERE id = ?').get(r.referred_by)?.email || ''
        : '',
      created_at: r.created_at
    }))
  });
});

router.delete('/api/subscribers/:id', (req, res) => {
  db.prepare('DELETE FROM referral_events WHERE referred_id = ? OR referrer_id = ?').run(req.params.id, req.params.id);
  db.prepare('DELETE FROM subscribers WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- broadcast ----------
router.post('/api/waitlists/:id/broadcast', (req, res) => {
  const wl = db.prepare('SELECT * FROM waitlists WHERE id = ?').get(req.params.id);
  if (!wl) return res.status(404).json({ error: 'Not found' });
  const { subject, body, audience = 'verified', topN = 100 } = req.body || {};
  if (!subject || !body) return res.status(400).json({ error: 'Subject and body are required' });
  if (!smtpConfigured()) return res.status(400).json({ error: 'SMTP is not configured — set it up in Settings first' });

  let rows;
  if (audience === 'all') {
    rows = db.prepare('SELECT * FROM subscribers WHERE waitlist_id = ?').all(wl.id);
  } else if (audience === 'top') {
    rows = db
      .prepare('SELECT * FROM subscribers WHERE waitlist_id = ? ORDER BY points DESC, created_at ASC, id ASC LIMIT ?')
      .all(wl.id, Math.max(1, parseInt(topN, 10) || 100));
  } else {
    rows = db.prepare('SELECT * FROM subscribers WHERE waitlist_id = ? AND verified = 1').all(wl.id);
  }

  const total = totalOf(wl.id);
  for (const sub of rows) {
    const referralUrl = `${baseUrl(req)}/w/${wl.slug}?ref=${sub.ref_code}`;
    const html = String(body)
      .replaceAll('{{name}}', sub.name || 'there')
      .replaceAll('{{position}}', String(positionOf(sub.id)))
      .replaceAll('{{total}}', String(total))
      .replaceAll('{{referral_link}}', referralUrl)
      .replace(/\n/g, '<br>');
    enqueue(sub.email, subject, html);
  }
  res.json({ ok: true, queued: rows.length });
});

// ---------- CSV export ----------
function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

router.get('/api/waitlists/:id/export.csv', (req, res) => {
  const wl = db.prepare('SELECT * FROM waitlists WHERE id = ?').get(req.params.id);
  if (!wl) return res.status(404).json({ error: 'Not found' });
  const rows = db
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM referral_events e WHERE e.referrer_id = s.id AND e.credited = 1) AS referral_count,
       (SELECT email FROM subscribers r WHERE r.id = s.referred_by) AS ref_source
       FROM subscribers s WHERE s.waitlist_id = ? ORDER BY s.points DESC, s.created_at ASC, s.id ASC`
    )
    .all(wl.id);
  const lines = ['email,name,position,referral_count,verified,created_at,ref_source'];
  rows.forEach((r, i) => {
    lines.push(
      [r.email, r.name, i + 1, r.referral_count, r.verified ? 'yes' : 'no', new Date(r.created_at).toISOString(), r.ref_source || '']
        .map(csvCell)
        .join(',')
    );
  });
  res
    .type('text/csv')
    .setHeader('Content-Disposition', `attachment; filename="${wl.slug}-waitlist.csv"`)
    .send(lines.join('\n'));
});

// ---------- SMTP settings ----------
router.get('/api/settings/smtp', (req, res) => {
  const cfg = getSmtpConfig();
  res.json({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    user: cfg.user,
    pass: cfg.pass ? '••••••••' : '',
    from: cfg.from,
    configured: smtpConfigured(),
    blocklist_enabled: getSetting('blocklist_enabled', '1') === '1',
    gmail_normalize: getSetting('gmail_normalize', '1') === '1'
  });
});

router.put('/api/settings/smtp', (req, res) => {
  const b = req.body || {};
  if (b.host != null) setSetting('smtp_host', b.host);
  if (b.port != null) setSetting('smtp_port', b.port);
  if (b.secure != null) setSetting('smtp_secure', b.secure ? 'true' : 'false');
  if (b.user != null) setSetting('smtp_user', b.user);
  if (b.pass != null && b.pass !== '••••••••') setSetting('smtp_pass', b.pass);
  if (b.from != null) setSetting('smtp_from', b.from);
  if (b.blocklist_enabled != null) setSetting('blocklist_enabled', b.blocklist_enabled ? '1' : '0');
  if (b.gmail_normalize != null) setSetting('gmail_normalize', b.gmail_normalize ? '1' : '0');
  res.json({ ok: true, configured: smtpConfigured() });
});

router.post('/api/settings/smtp/test', async (req, res) => {
  const to = req.body?.to;
  if (!to) return res.status(400).json({ error: 'Recipient email required' });
  try {
    await testSend(to);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

export default router;
