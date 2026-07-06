// Public, unauthenticated surface: signup API, verification, position lookup,
// embeddable widget script, and the hosted waitlist page.
import express from 'express';
import crypto from 'node:crypto';
import db, { getSetting, positionOf, totalOf } from './db.js';
import {
  enqueue,
  smtpConfigured,
  baseUrl,
  verificationEmail,
  welcomeEmail,
  movedUpEmail
} from './mailer.js';

const router = express.Router();

const RATE_LIMIT = parseInt(process.env.RATE_LIMIT_SIGNUPS || '5', 10);
const RATE_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || String(3600 * 1000), 10);
const REFERRAL_IP_CAP = parseInt(process.env.REFERRAL_IP_CREDIT_CAP || '3', 10);

// CORS so the embed widget can post from any host page.
router.use('/api/public', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
}

export function normalizeEmail(raw) {
  let email = String(raw || '').trim().toLowerCase();
  if (getSetting('gmail_normalize', '1') === '1') {
    const m = email.match(/^([^@]+)@(gmail\.com|googlemail\.com)$/);
    if (m) {
      const local = m[1].split('+')[0].replace(/\./g, '');
      email = `${local}@gmail.com`;
    }
  }
  return email;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function refCode() {
  return crypto.randomBytes(5).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) ||
    crypto.randomBytes(4).toString('hex');
}

function getWaitlistBySlug(slug) {
  return db.prepare('SELECT * FROM waitlists WHERE slug = ?').get(slug);
}

function referralUrlFor(req, wl, code) {
  return `${baseUrl(req)}/w/${wl.slug}?ref=${code}`;
}

function creditReferrer(req, subscriber, waitlist) {
  if (!subscriber.referred_by) return;
  const referrer = db.prepare('SELECT * FROM subscribers WHERE id = ?').get(subscriber.referred_by);
  if (!referrer) return;
  const event = db
    .prepare('SELECT * FROM referral_events WHERE referred_id = ? AND credited = 0')
    .get(subscriber.id);
  if (!event) return;
  // Referral fraud guard: cap credited referrals per referrer coming from the same IP.
  const sameIpCredits = db
    .prepare(
      `SELECT COUNT(*) AS c FROM referral_events e
       JOIN subscribers s ON s.id = e.referred_id
       WHERE e.referrer_id = ? AND e.credited = 1 AND s.ip = ?`
    )
    .get(referrer.id, subscriber.ip || '').c;
  if (sameIpCredits >= REFERRAL_IP_CAP) return;

  db.prepare('UPDATE referral_events SET credited = 1 WHERE id = ?').run(event.id);
  db.prepare('UPDATE subscribers SET points = points + ? WHERE id = ?').run(
    waitlist.referral_boost,
    referrer.id
  );
  if (waitlist.notify_moveup && smtpConfigured()) {
    const pos = positionOf(referrer.id);
    const total = totalOf(waitlist.id);
    const mail = movedUpEmail({
      waitlistName: waitlist.name,
      position: pos,
      total,
      referralUrl: referralUrlFor(req, waitlist, referrer.ref_code)
    });
    enqueue(referrer.email, mail.subject, mail.html);
  }
}

// ---------- signup ----------
router.post('/api/public/:slug/signup', (req, res) => {
  const wl = getWaitlistBySlug(req.params.slug);
  if (!wl) return res.status(404).json({ error: 'Waitlist not found' });

  const { email: rawEmail, name = '', ref = '', honeypot = '', website = '' } = req.body || {};

  // Honeypot: bots fill hidden fields. Pretend success, store nothing.
  if (honeypot || website) {
    return res.status(201).json({ ok: true, position: totalOf(wl.id) + 1, refCode: refCode(), total: totalOf(wl.id) + 1 });
  }

  const email = normalizeEmail(rawEmail);
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });

  // Disposable-domain blocklist
  if (getSetting('blocklist_enabled', '1') === '1') {
    const domain = email.split('@')[1];
    const blocked = db.prepare('SELECT 1 FROM blocked_domains WHERE domain = ?').get(domain);
    if (blocked) return res.status(400).json({ error: 'Disposable email addresses are not allowed' });
  }

  // Dedupe by normalized email
  const existing = db
    .prepare('SELECT * FROM subscribers WHERE waitlist_id = ? AND email = ?')
    .get(wl.id, email);
  if (existing) {
    return res.status(409).json({
      error: 'This email is already on the waitlist',
      position: positionOf(existing.id),
      refCode: existing.ref_code,
      total: totalOf(wl.id)
    });
  }

  // Signup cap
  const total = totalOf(wl.id);
  if (wl.signup_cap > 0 && total >= wl.signup_cap) {
    return res.status(403).json({ error: 'This waitlist is full' });
  }

  // Per-IP rate limit (SQLite counter — only successful signups count)
  const ip = clientIp(req);
  const recent = db
    .prepare('SELECT COUNT(*) AS c FROM subscribers WHERE ip = ? AND created_at > ?')
    .get(ip, Date.now() - RATE_WINDOW_MS).c;
  if (recent >= RATE_LIMIT) {
    return res.status(429).json({ error: 'Too many signups from this address — try again later' });
  }

  // Resolve referrer (self-referral prevention: same email never credits)
  let referrer = null;
  if (ref) {
    referrer = db
      .prepare('SELECT * FROM subscribers WHERE waitlist_id = ? AND ref_code = ?')
      .get(wl.id, String(ref));
    if (referrer && referrer.email === email) referrer = null;
  }

  const verified = wl.require_verify ? 0 : 1;
  const verifyToken = wl.require_verify ? crypto.randomBytes(24).toString('hex') : null;
  const code = refCode();

  const info = db
    .prepare(
      `INSERT INTO subscribers (waitlist_id, email, name, ref_code, referred_by, verified, verify_token, ip, ua)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      wl.id,
      email,
      String(name || '').slice(0, 120),
      code,
      referrer ? referrer.id : null,
      verified,
      verifyToken,
      ip,
      String(req.headers['user-agent'] || '').slice(0, 300)
    );
  const subId = info.lastInsertRowid;

  if (referrer) {
    db.prepare(
      'INSERT INTO referral_events (waitlist_id, referrer_id, referred_id, credited) VALUES (?, ?, ?, 0)'
    ).run(wl.id, referrer.id, subId);
  }

  const sub = db.prepare('SELECT * FROM subscribers WHERE id = ?').get(subId);
  if (verified) {
    // No verification required — credit referral immediately
    creditReferrer(req, sub, wl);
  }

  const position = positionOf(subId);
  const newTotal = totalOf(wl.id);
  const referralUrl = referralUrlFor(req, wl, code);

  if (smtpConfigured()) {
    if (wl.require_verify) {
      const mail = verificationEmail({
        waitlistName: wl.name,
        verifyUrl: `${baseUrl(req)}/api/public/verify/${verifyToken}`,
        position,
        total: newTotal,
        referralUrl
      });
      enqueue(email, mail.subject, mail.html);
    } else {
      const mail = welcomeEmail({
        waitlistName: wl.name,
        position,
        total: newTotal,
        referralUrl,
        boost: wl.referral_boost
      });
      enqueue(email, mail.subject, mail.html);
    }
  }

  res.status(201).json({ ok: true, position, refCode: code, total: newTotal, referralUrl });
});

// ---------- position lookup ----------
router.get('/api/public/:slug/position', (req, res) => {
  const wl = getWaitlistBySlug(req.params.slug);
  if (!wl) return res.status(404).json({ error: 'Waitlist not found' });
  const sub = db
    .prepare('SELECT * FROM subscribers WHERE waitlist_id = ? AND ref_code = ?')
    .get(wl.id, String(req.query.code || ''));
  if (!sub) return res.status(404).json({ error: 'Unknown code' });
  const referrals = db
    .prepare('SELECT COUNT(*) AS c FROM referral_events WHERE referrer_id = ? AND credited = 1')
    .get(sub.id).c;
  res.json({
    position: positionOf(sub.id),
    total: totalOf(wl.id),
    points: sub.points,
    verified: !!sub.verified,
    referrals,
    referralUrl: referralUrlFor(req, wl, sub.ref_code)
  });
});

// ---------- widget config ----------
router.get('/api/public/:slug/config', (req, res) => {
  const wl = getWaitlistBySlug(req.params.slug);
  if (!wl) return res.status(404).json({ error: 'Waitlist not found' });
  let theme = {};
  try { theme = JSON.parse(wl.theme_json || '{}'); } catch { /* noop */ }
  res.json({
    name: wl.name,
    headline: wl.headline,
    description: wl.description,
    boost: wl.referral_boost,
    total: totalOf(wl.id),
    theme: { mode: theme.mode || 'dark', accent: theme.accent || '#7c5cff' }
  });
});

// ---------- email verification ----------
router.get('/api/public/verify/:token', (req, res) => {
  const sub = db.prepare('SELECT * FROM subscribers WHERE verify_token = ?').get(req.params.token);
  if (!sub) return res.status(404).send(verifyPage('Link expired', 'This verification link is invalid or was already used.', null));
  const wl = db.prepare('SELECT * FROM waitlists WHERE id = ?').get(sub.waitlist_id);
  if (!sub.verified) {
    db.prepare('UPDATE subscribers SET verified = 1, verify_token = NULL WHERE id = ?').run(sub.id);
    const fresh = db.prepare('SELECT * FROM subscribers WHERE id = ?').get(sub.id);
    creditReferrer(req, fresh, wl);
    if (smtpConfigured()) {
      const mail = welcomeEmail({
        waitlistName: wl.name,
        position: positionOf(sub.id),
        total: totalOf(wl.id),
        referralUrl: referralUrlFor(req, wl, sub.ref_code),
        boost: wl.referral_boost
      });
      enqueue(sub.email, mail.subject, mail.html);
    }
  }
  const pos = positionOf(sub.id);
  res.send(
    verifyPage(
      'Email confirmed ✅',
      `You're #${pos} of ${totalOf(wl.id)} on the ${esc(wl.name)} waitlist.`,
      `/w/${wl.slug}?code=${sub.ref_code}`
    )
  );
});

function verifyPage(title, body, link) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;font-family:'Segoe UI',system-ui,sans-serif;background:#0b0b12;color:#e6e6f0;display:grid;place-items:center;min-height:100vh}
.card{background:#15151f;border:1px solid #2a2a3a;border-radius:16px;padding:40px;max-width:420px;text-align:center}
a{color:#9d8cff}h1{font-size:22px}</style></head>
<body><div class="card"><h1>${title}</h1><p>${body}</p>${link ? `<p><a href="${link}">View your position →</a></p>` : ''}</div></body></html>`;
}

// ---------- embed.js ----------
router.get('/embed.js', (req, res) => {
  res.type('application/javascript').setHeader('Access-Control-Allow-Origin', '*');
  res.send(EMBED_JS);
});

const EMBED_JS = `(function () {
  var script = document.currentScript;
  var slug = script.getAttribute('data-waitlist');
  if (!slug) return console.error('[queuecraft] missing data-waitlist attribute');
  var base = new URL(script.src).origin;

  var host = document.createElement('div');
  script.parentNode.insertBefore(host, script.nextSibling);
  var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;

  fetch(base + '/api/public/' + slug + '/config')
    .then(function (r) { return r.json(); })
    .then(function (cfg) { render(cfg); })
    .catch(function () { render({ name: slug, headline: '', theme: { mode: 'dark', accent: '#7c5cff' } }); });

  function render(cfg) {
    var t = cfg.theme || {};
    var dark = t.mode !== 'light';
    var accent = t.accent || '#7c5cff';
    var bg = dark ? '#15151f' : '#ffffff';
    var fg = dark ? '#e6e6f0' : '#1a1a24';
    var border = dark ? '#2a2a3a' : '#e2e2ea';
    var muted = dark ? '#8a8aa0' : '#6b6b80';
    var style = document.createElement('style');
    style.textContent =
      '.qc{font-family:Segoe UI,system-ui,sans-serif;background:' + bg + ';color:' + fg + ';border:1px solid ' + border + ';border-radius:14px;padding:22px;max-width:420px}' +
      '.qc h3{margin:0 0 6px;font-size:18px}.qc p{margin:0 0 14px;font-size:13px;color:' + muted + '}' +
      '.qc form{display:flex;gap:8px}.qc input{flex:1;padding:10px 12px;border-radius:9px;border:1px solid ' + border + ';background:transparent;color:' + fg + ';font-size:14px;outline:none}' +
      '.qc button{background:' + accent + ';color:#fff;border:0;border-radius:9px;padding:10px 16px;font-weight:600;cursor:pointer;font-size:14px}' +
      '.qc .hp{position:absolute;left:-9999px;opacity:0;height:0;width:0}' +
      '.qc .ok{font-size:14px}.qc .ok b{color:' + accent + '}' +
      '.qc .link{margin-top:10px;padding:9px 12px;border:1px dashed ' + border + ';border-radius:9px;font-size:12px;word-break:break-all;cursor:pointer}' +
      '.qc .err{color:#f87171;font-size:12px;margin-top:8px}';
    root.appendChild(style);
    var box = document.createElement('div');
    box.className = 'qc';
    box.innerHTML =
      '<h3></h3><p></p>' +
      '<form><input type="email" required placeholder="you@example.com">' +
      '<input class="hp" type="text" name="website" tabindex="-1" autocomplete="off">' +
      '<button type="submit">Join waitlist</button></form><div class="err" style="display:none"></div>';
    box.querySelector('h3').textContent = cfg.headline || cfg.name || 'Join the waitlist';
    box.querySelector('p').textContent = cfg.description || 'Be first in line when we launch.';
    root.appendChild(box);

    var params = new URLSearchParams(location.search);
    var ref = params.get('ref') || '';

    box.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      var email = box.querySelector('input[type=email]').value;
      var hp = box.querySelector('.hp').value;
      fetch(base + '/api/public/' + slug + '/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, ref: ref, honeypot: hp })
      })
        .then(function (r) { return r.json().then(function (d) { return { s: r.status, d: d }; }); })
        .then(function (res) {
          if (res.s === 201 || res.s === 409) {
            var url = res.d.referralUrl || (base + '/w/' + slug + '?ref=' + res.d.refCode);
            box.innerHTML =
              '<div class="ok">You are <b>#' + res.d.position + '</b> of ' + res.d.total +
              '. Refer friends to jump the line — share your link:</div>' +
              '<div class="link" title="Click to copy">' + url + '</div>';
            box.querySelector('.link').addEventListener('click', function () {
              navigator.clipboard && navigator.clipboard.writeText(url);
              this.textContent = 'Copied! ' + url;
            });
          } else {
            var err = box.querySelector('.err');
            err.style.display = 'block';
            err.textContent = res.d.error || 'Something went wrong';
          }
        });
    });
  }
})();`;

// ---------- hosted page ----------
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

router.get('/w/:slug', (req, res) => {
  const wl = getWaitlistBySlug(req.params.slug);
  if (!wl) return res.status(404).send(verifyPage('Not found', 'This waitlist does not exist.', null));
  let theme = {};
  try { theme = JSON.parse(wl.theme_json || '{}'); } catch { /* noop */ }
  const dark = (theme.mode || 'dark') !== 'light';
  const accent = theme.accent || '#7c5cff';
  const total = totalOf(wl.id);
  const c = dark
    ? { bg: '#0b0b12', card: '#15151f', fg: '#e6e6f0', muted: '#8a8aa0', border: '#2a2a3a' }
    : { bg: '#f4f4f8', card: '#ffffff', fg: '#1a1a24', muted: '#6b6b80', border: '#e2e2ea' };

  res.send(`<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(wl.name)} — Waitlist</title>
<meta name="description" content="${esc(wl.headline || `Join the ${wl.name} waitlist`)}">
<style>
*{box-sizing:border-box}body{margin:0;font-family:'Segoe UI',system-ui,sans-serif;background:${c.bg};color:${c.fg};min-height:100vh;display:grid;place-items:center;padding:24px}
.wrap{max-width:520px;width:100%}
.badge{display:inline-block;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:${accent};border:1px solid ${accent}44;border-radius:999px;padding:5px 14px;margin-bottom:18px}
h1{font-size:34px;line-height:1.15;margin:0 0 12px}
.sub{color:${c.muted};font-size:16px;margin:0 0 28px}
.card{background:${c.card};border:1px solid ${c.border};border-radius:18px;padding:26px;box-shadow:0 20px 60px rgba(0,0,0,${dark ? '.4' : '.08'})}
form{display:flex;flex-direction:column;gap:10px}
input{padding:13px 15px;border-radius:11px;border:1px solid ${c.border};background:transparent;color:${c.fg};font-size:15px;outline:none}
input:focus{border-color:${accent}}
button{background:${accent};color:#fff;border:0;border-radius:11px;padding:14px;font-weight:700;font-size:15px;cursor:pointer;transition:filter .15s}
button:hover{filter:brightness(1.1)}
.hp{position:absolute;left:-9999px;opacity:0;height:0;width:0}
.count{color:${c.muted};font-size:13px;text-align:center;margin-top:14px}
.err{color:#f87171;font-size:13px;display:none}
#result{display:none;text-align:center}
.pos{font-size:42px;font-weight:800;color:${accent};margin:6px 0}
.share{display:flex;gap:10px;justify-content:center;margin-top:16px}
.share a,.share button{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;background:transparent;border:1px solid ${c.border};color:${c.fg};border-radius:10px;padding:9px 16px;font-size:13px;text-decoration:none;cursor:pointer}
.reflink{margin-top:14px;padding:11px 14px;border:1px dashed ${c.border};border-radius:10px;font-size:12px;word-break:break-all;color:${c.muted};cursor:pointer}
footer{text-align:center;color:${c.muted};font-size:11px;margin-top:24px}footer a{color:${c.muted}}
</style></head><body><div class="wrap">
<div style="text-align:center">
<span class="badge">Early access</span>
<h1>${esc(wl.headline || wl.name)}</h1>
<p class="sub">${esc(wl.description || 'Be first in line when we launch. Refer friends to jump the queue.')}</p>
</div>
<div class="card">
<form id="f">
  <input type="text" id="name" placeholder="Your name (optional)" maxlength="120">
  <input type="email" id="email" placeholder="you@example.com" required>
  <input class="hp" type="text" id="hp" name="website" tabindex="-1" autocomplete="off">
  <button type="submit">Join the waitlist →</button>
  <div class="err" id="err"></div>
</form>
<div id="result">
  <div>You're on the list 🎉</div>
  <div class="pos" id="pos"></div>
  <div id="of" style="color:${c.muted};font-size:14px"></div>
  <div style="margin-top:14px;font-size:14px">Refer <b>3 friends</b> to jump the line — every signup moves you up <b>${wl.referral_boost} spots</b>.</div>
  <div class="reflink" id="reflink" title="Click to copy"></div>
  <div class="share">
    <a id="tweet" target="_blank" rel="noopener">Share on X</a>
    <button id="copy">Copy link</button>
  </div>
</div>
<div class="count">${total > 0 ? `${total.toLocaleString()} ${total === 1 ? 'person' : 'people'} waiting` : 'Be the first to join'}</div>
</div>
<footer>Powered by <a href="https://github.com/bensblueprints" rel="noopener">Queuecraft</a></footer>
</div>
<script>
(function(){
  var params = new URLSearchParams(location.search);
  var ref = params.get('ref') || '';
  var f = document.getElementById('f');
  var result = document.getElementById('result');
  function show(d){
    f.style.display='none';result.style.display='block';
    document.getElementById('pos').textContent='#'+d.position;
    document.getElementById('of').textContent='of '+d.total+' in line';
    var url=d.referralUrl||location.origin+'/w/${wl.slug}?ref='+d.refCode;
    document.getElementById('reflink').textContent=url;
    document.getElementById('tweet').href='https://twitter.com/intent/tweet?text='+encodeURIComponent("I'm #"+d.position+' in line for ${esc(wl.name).replace(/'/g, '')} — join me: '+url);
    function copy(){navigator.clipboard&&navigator.clipboard.writeText(url);document.getElementById('copy').textContent='Copied ✓';}
    document.getElementById('copy').addEventListener('click',copy);
    document.getElementById('reflink').addEventListener('click',copy);
    try{localStorage.setItem('qc_${wl.slug}',d.refCode||'');}catch(e){}
  }
  var saved = params.get('code') || (function(){try{return localStorage.getItem('qc_${wl.slug}')}catch(e){return null}})();
  if(saved){
    fetch('/api/public/${wl.slug}/position?code='+encodeURIComponent(saved)).then(function(r){return r.ok?r.json():null}).then(function(d){
      if(d) show({position:d.position,total:d.total,refCode:saved,referralUrl:d.referralUrl});
    }).catch(function(){});
  }
  f.addEventListener('submit',function(e){
    e.preventDefault();
    fetch('/api/public/${wl.slug}/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      email:document.getElementById('email').value,
      name:document.getElementById('name').value,
      ref:ref,honeypot:document.getElementById('hp').value
    })}).then(function(r){return r.json().then(function(d){return {s:r.status,d:d}})}).then(function(res){
      if(res.s===201||res.s===409){show(res.d)}
      else{var err=document.getElementById('err');err.style.display='block';err.textContent=res.d.error||'Something went wrong'}
    });
  });
})();
</script></body></html>`);
});

export default router;
