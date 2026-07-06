import crypto from 'node:crypto';

const sessions = new Map(); // token -> expiry (ms)
const SESSION_TTL = 7 * 24 * 3600 * 1000;
const COOKIE_NAME = 'qc_session';

function authDisabled() {
  return process.env.AUTH_DISABLED === 'true';
}

export function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL);
  return token;
}

export function isValidSession(token) {
  if (!token) return false;
  const expiry = sessions.get(token);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function destroySession(token) {
  sessions.delete(token);
}

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function checkPassword(password) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  return timingSafeEqual(password || '', expected);
}

/** Express middleware guarding admin API routes. */
export function requireAuth(req, res, next) {
  if (authDisabled()) return next();
  const token = req.cookies?.[COOKIE_NAME];
  if (isValidSession(token)) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

export function isAuthed(req) {
  if (authDisabled()) return true;
  return isValidSession(req.cookies?.[COOKIE_NAME]);
}

export { COOKIE_NAME };
