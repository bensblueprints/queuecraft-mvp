// Smoke test: boots the real server + a stub SMTP server, then walks the whole
// signup → verify → referral-boost → export → broadcast pipeline, asserting
// against the HTTP API, the stub SMTP inbox, and SQLite directly.
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { SMTPServer } from 'smtp-server';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const TEST_PORT = 5394;
const SMTP_PORT = 5395;
const ADMIN_PASSWORD = 'smoke-test-password';
const DB_PATH = path.join(__dirname, 'smoke.db');
const BASE = `http://127.0.0.1:${TEST_PORT}`;

for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

let serverProc = null;
let smtp = null;
const inbox = []; // { to: [addresses], data: raw }

function startStubSmtp() {
  return new Promise((resolve) => {
    smtp = new SMTPServer({
      authOptional: true,
      disabledCommands: ['STARTTLS', 'AUTH'],
      onData(stream, session, cb) {
        let data = '';
        stream.on('data', (c) => (data += c));
        stream.on('end', () => {
          inbox.push({ to: session.envelope.rcptTo.map((r) => r.address), data });
          cb();
        });
      }
    });
    smtp.listen(SMTP_PORT, '127.0.0.1', resolve);
  });
}

async function waitFor(fn, label, tries = 60, delay = 200) {
  for (let i = 0; i < tries; i++) {
    try {
      const v = await fn();
      if (v) return v;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, delay));
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

let cookie = '';
async function api(pathname, options = {}) {
  const res = await fetch(BASE + pathname, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  console.log('1. Starting stub SMTP server on port', SMTP_PORT);
  await startStubSmtp();

  console.log('2. Starting Queuecraft server on port', TEST_PORT);
  serverProc = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      ADMIN_PASSWORD,
      DB_PATH,
      AUTH_DISABLED: 'false',
      BASE_URL: BASE,
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(SMTP_PORT),
      SMTP_SECURE: 'false',
      SMTP_FROM: 'waitlist@queuecraft.test',
      EMAIL_QUEUE_INTERVAL_MS: '250'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  serverProc.stdout.on('data', (d) => process.stdout.write(`   [server] ${d}`));
  serverProc.stderr.on('data', (d) => process.stderr.write(`   [server] ${d}`));

  await waitFor(async () => (await api('/api/health')).data.ok, 'server health');

  console.log('3. Auth: wrong password 401, unauth admin API 401, right password 200');
  const bad = await api('/api/login', { method: 'POST', body: { password: 'wrong' } });
  assert.strictEqual(bad.status, 401, 'wrong password must 401');
  cookie = '';
  const unauth = await api('/api/waitlists');
  assert.strictEqual(unauth.status, 401, 'admin API must require auth');
  const good = await api('/api/login', { method: 'POST', body: { password: ADMIN_PASSWORD } });
  assert.strictEqual(good.status, 200, 'login must succeed');

  console.log('4. Creating waitlist');
  const created = await api('/api/waitlists', {
    method: 'POST',
    body: { name: 'Beta Launch', slug: 'beta', referral_boost: 5, require_verify: 1 }
  });
  assert.strictEqual(created.status, 201, 'waitlist create must 201');
  assert.strictEqual(created.data.slug, 'beta');

  const { default: Database } = await import('better-sqlite3');
  const rdb = () => new Database(DB_PATH, { readonly: true });

  const signup = (body) =>
    fetch(`${BASE}/api/public/beta/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));

  async function verifyByEmail(email) {
    const db = rdb();
    const row = db.prepare('SELECT verify_token FROM subscribers WHERE email = ?').get(email);
    db.close();
    assert.ok(row?.verify_token, `verify_token must exist for ${email}`);
    const res = await fetch(`${BASE}/api/public/verify/${row.verify_token}`);
    assert.strictEqual(res.status, 200, 'verify link must 200');
    const db2 = rdb();
    const v = db2.prepare('SELECT verified FROM subscribers WHERE email = ?').get(email);
    db2.close();
    assert.strictEqual(v.verified, 1, `${email} must be verified=1 in SQLite`);
  }

  console.log('5. Signup A → position 1, refCode returned, verification mail captured by stub SMTP');
  const a = await signup({ email: 'alice@example.com', name: 'Alice' });
  assert.strictEqual(a.status, 201, 'signup must 201');
  assert.strictEqual(a.data.position, 1, 'first signup must be position 1');
  assert.ok(a.data.refCode, 'refCode must be returned');
  await waitFor(
    () => inbox.some((m) => m.to.includes('alice@example.com') && /Confirm/i.test(m.data)),
    'verification email captured by stub SMTP'
  );
  {
    const db = rdb();
    const q = db.prepare("SELECT COUNT(*) AS c FROM email_queue WHERE to_email = 'alice@example.com'").get().c;
    db.close();
    assert.ok(q >= 1, 'verification email row must exist in email_queue');
  }
  await verifyByEmail('alice@example.com');

  console.log('6. Referral ranking: C signs up plain, B signs up with ref=C — verified B moves C above A');
  const c = await signup({ email: 'carol@example.com', name: 'Carol' });
  assert.strictEqual(c.status, 201);
  assert.strictEqual(c.data.position, 2, 'C joins at position 2 (behind A)');
  await verifyByEmail('carol@example.com');

  const b = await signup({ email: 'bob@example.com', name: 'Bob', ref: c.data.refCode });
  assert.strictEqual(b.status, 201);
  await verifyByEmail('bob@example.com');

  const cPos = await fetch(`${BASE}/api/public/beta/position?code=${c.data.refCode}`).then((r) => r.json());
  assert.strictEqual(cPos.position, 1, "C's verified referral must move C above A (position 1)");
  assert.strictEqual(cPos.referrals, 1, 'C must show 1 credited referral');
  const aPos1 = await fetch(`${BASE}/api/public/beta/position?code=${a.data.refCode}`).then((r) => r.json());
  assert.strictEqual(aPos1.position, 2, 'A must have dropped to position 2');

  console.log('7. D + E sign up with ref=A and verify — A points increase, A retakes #1');
  const d = await signup({ email: 'dave@example.com', ref: a.data.refCode });
  assert.strictEqual(d.status, 201);
  await verifyByEmail('dave@example.com');
  const e = await signup({ email: 'erin@example.com', ref: a.data.refCode });
  assert.strictEqual(e.status, 201);
  await verifyByEmail('erin@example.com');

  {
    const db = rdb();
    const aRow = db.prepare("SELECT points FROM subscribers WHERE email = 'alice@example.com'").get();
    assert.strictEqual(aRow.points, 10, "A's points must be 10 after 2 verified referrals (boost 5)");
    const credited = db.prepare('SELECT COUNT(*) AS c FROM referral_events WHERE credited = 1').get().c;
    assert.strictEqual(credited, 3, '3 credited referral_events rows must exist');
    db.close();
  }
  const aPos2 = await fetch(`${BASE}/api/public/beta/position?code=${a.data.refCode}`).then((r) => r.json());
  assert.strictEqual(aPos2.position, 1, 'A must be back at #1 with 10 points');

  console.log('8. Anti-spam: duplicate 409, honeypot dropped, 6th same-IP 429, disposable domain 400');
  const dup = await signup({ email: 'alice@example.com' });
  assert.strictEqual(dup.status, 409, 'duplicate email must 409');

  const countBefore = () => {
    const db = rdb();
    const n = db.prepare('SELECT COUNT(*) AS c FROM subscribers').get().c;
    db.close();
    return n;
  };
  const before = countBefore();
  const honey = await signup({ email: 'bot@example.com', honeypot: 'gotcha' });
  assert.ok(honey.status < 400, 'honeypot signup must be silently accepted');
  assert.strictEqual(countBefore(), before, 'honeypot signup must not create a row');

  const sixth = await signup({ email: 'frank@example.com' });
  assert.strictEqual(sixth.status, 429, '6th signup from same IP within window must 429');

  const disposable = await signup({ email: 'spam@mailinator.com' });
  assert.strictEqual(disposable.status, 400, 'disposable domain must 400');

  console.log('9. CSV export: header + 5 rows, positions match ranking');
  const wlId = created.data.id;
  const csvRes = await fetch(`${BASE}/api/waitlists/${wlId}/export.csv`, { headers: { Cookie: cookie } });
  assert.strictEqual(csvRes.status, 200, 'export must 200');
  const csv = await csvRes.text();
  const lines = csv.trim().split('\n');
  assert.strictEqual(lines[0], 'email,name,position,referral_count,verified,created_at,ref_source');
  assert.strictEqual(lines.length, 6, 'header + 5 subscriber rows');
  assert.ok(lines[1].startsWith('alice@example.com,Alice,1,2,yes'), `row 1 must be Alice at position 1, got: ${lines[1]}`);
  assert.ok(lines[2].startsWith('carol@example.com,Carol,2,1,yes'), `row 2 must be Carol at position 2, got: ${lines[2]}`);

  console.log('10. Broadcast to verified → queued count equals verified subscribers, delivered via stub SMTP');
  const queueBefore = (() => {
    const db = rdb();
    const n = db.prepare('SELECT COUNT(*) AS c FROM email_queue').get().c;
    db.close();
    return n;
  })();
  const bc = await api(`/api/waitlists/${wlId}/broadcast`, {
    method: 'POST',
    body: { subject: 'We are live!', body: 'Hey {{name}}, you were #{{position}} — we just launched!', audience: 'verified' }
  });
  assert.strictEqual(bc.status, 200, 'broadcast must 200');
  assert.strictEqual(bc.data.queued, 5, 'broadcast must queue exactly the 5 verified subscribers');
  {
    const db = rdb();
    const n = db.prepare('SELECT COUNT(*) AS c FROM email_queue').get().c;
    db.close();
    assert.strictEqual(n - queueBefore, 5, '5 new email_queue rows');
  }
  await waitFor(
    () => inbox.filter((m) => /We are live!/.test(m.data)).length === 5,
    'all 5 broadcast emails captured by stub SMTP'
  );

  console.log('11. Public surfaces: hosted page + embed.js respond');
  const page = await fetch(`${BASE}/w/beta`).then((r) => r.text());
  assert.ok(page.includes('Beta Launch'), 'hosted page must render waitlist name');
  const embedRes = await fetch(`${BASE}/embed.js`);
  assert.strictEqual(embedRes.status, 200);
  assert.strictEqual(embedRes.headers.get('access-control-allow-origin'), '*', 'embed must be CORS-open');
  const corsProbe = await fetch(`${BASE}/api/public/beta/config`);
  assert.strictEqual(corsProbe.headers.get('access-control-allow-origin'), '*', 'public API must be CORS-open');

  console.log('\nSMOKE TEST PASSED ✔  (auth, signup, verify via stub SMTP, referral ranking, anti-spam, CSV, broadcast, embed)');
}

main()
  .then(() => cleanup(0))
  .catch((err) => {
    console.error('\nSMOKE TEST FAILED ✖');
    console.error(err);
    cleanup(1);
  });

function cleanup(code) {
  try { serverProc?.kill(); } catch { /* ignore */ }
  try { smtp?.close(); } catch { /* ignore */ }
  setTimeout(() => {
    for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
    process.exit(code);
  }, 400);
}
