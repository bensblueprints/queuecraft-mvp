async function req(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, data });
  return data;
}

export const api = {
  me: () => req('/api/me'),
  login: (password) => req('/api/login', { method: 'POST', body: { password } }),
  logout: () => req('/api/logout', { method: 'POST' }),
  waitlists: () => req('/api/waitlists'),
  waitlist: (id) => req(`/api/waitlists/${id}`),
  createWaitlist: (body) => req('/api/waitlists', { method: 'POST', body }),
  updateWaitlist: (id, body) => req(`/api/waitlists/${id}`, { method: 'PUT', body }),
  deleteWaitlist: (id) => req(`/api/waitlists/${id}`, { method: 'DELETE' }),
  subscribers: (id, search = '', page = 1) =>
    req(`/api/waitlists/${id}/subscribers?search=${encodeURIComponent(search)}&page=${page}`),
  deleteSubscriber: (id) => req(`/api/subscribers/${id}`, { method: 'DELETE' }),
  broadcast: (id, body) => req(`/api/waitlists/${id}/broadcast`, { method: 'POST', body }),
  smtp: () => req('/api/settings/smtp'),
  saveSmtp: (body) => req('/api/settings/smtp', { method: 'PUT', body }),
  testSmtp: (to) => req('/api/settings/smtp/test', { method: 'POST', body: { to } })
};
