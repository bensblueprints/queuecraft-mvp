import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DISPOSABLE_DOMAINS } from './disposable-domains.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'queuecraft.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// Under Electron the Node-ABI binding won't load; use the vendored Electron prebuild.
function nativeBindingPath() {
  if (!process.versions.electron) return null;
  const p = path.join(__dirname, '..', 'vendor', 'better_sqlite3-electron.node');
  return fs.existsSync(p) ? p : null;
}

const nativeBinding = nativeBindingPath();
const db = new Database(DB_PATH, nativeBinding ? { nativeBinding } : {});
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS waitlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  headline TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  referral_boost INTEGER NOT NULL DEFAULT 5,
  theme_json TEXT NOT NULL DEFAULT '{}',
  signup_cap INTEGER NOT NULL DEFAULT 0,
  require_verify INTEGER NOT NULL DEFAULT 1,
  notify_moveup INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  waitlist_id INTEGER NOT NULL REFERENCES waitlists(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  ref_code TEXT NOT NULL UNIQUE,
  referred_by INTEGER,
  points INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,
  verify_token TEXT,
  ip TEXT,
  ua TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  UNIQUE(waitlist_id, email)
);
CREATE INDEX IF NOT EXISTS idx_subs_rank ON subscribers(waitlist_id, points DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_subs_ip ON subscribers(ip, created_at);

CREATE TABLE IF NOT EXISTS referral_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  waitlist_id INTEGER NOT NULL REFERENCES waitlists(id) ON DELETE CASCADE,
  referrer_id INTEGER NOT NULL,
  referred_id INTEGER NOT NULL,
  credited INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);
CREATE INDEX IF NOT EXISTS idx_refev_referrer ON referral_events(referrer_id, credited);

CREATE TABLE IF NOT EXISTS email_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | sent | failed
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  send_after INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);
CREATE INDEX IF NOT EXISTS idx_queue_status ON email_queue(status, send_after);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS blocked_domains (
  domain TEXT PRIMARY KEY
);
`);

db.pragma('foreign_keys = ON');

// Seed the disposable-email blocklist once (user can add/remove later).
const seeded = db.prepare('SELECT COUNT(*) AS c FROM blocked_domains').get().c;
if (seeded === 0) {
  const ins = db.prepare('INSERT OR IGNORE INTO blocked_domains (domain) VALUES (?)');
  const tx = db.transaction((domains) => {
    for (const d of domains) ins.run(d);
  });
  tx(DISPOSABLE_DOMAINS);
}

// ---------- settings helpers ----------
export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value ?? ''));
}

// ---------- ranking ----------
// Position is always computed, never stored — rank drifts as referrals land.
const positionStmt = () =>
  db.prepare(`
    SELECT COUNT(*) + 1 AS pos FROM subscribers s2, subscribers s
    WHERE s.id = @id AND s2.waitlist_id = s.waitlist_id AND s2.id != s.id AND (
      s2.points > s.points
      OR (s2.points = s.points AND s2.created_at < s.created_at)
      OR (s2.points = s.points AND s2.created_at = s.created_at AND s2.id < s.id)
    )
  `);

export function positionOf(subscriberId) {
  const row = positionStmt().get({ id: subscriberId });
  return row ? row.pos : null;
}

export function totalOf(waitlistId) {
  return db.prepare('SELECT COUNT(*) AS c FROM subscribers WHERE waitlist_id = ?').get(waitlistId).c;
}

export default db;
